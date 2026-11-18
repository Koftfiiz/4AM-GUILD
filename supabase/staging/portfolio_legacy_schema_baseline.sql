-- Staging-only synthetic baseline for the existing Portfolio Tracker schema.
-- Apply after guild_affiliation_staging_baseline.sql and 20261119000000_guild_affiliation_foundation.sql.
-- Never copy Production Portfolio rows or Storage paths into this project.

begin;

create or replace function public.is_portfolio_management()
returns boolean language sql stable security definer set search_path=''
as $$ select public.can_manage_guild_affiliations(); $$;
create or replace function public.is_portfolio_reviewer()
returns boolean language sql stable security definer set search_path=''
as $$ select public.can_manage_guild_affiliations(); $$;
create or replace function public.is_guild_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select public.can_manage_guild_affiliations(); $$;
revoke all on function public.is_portfolio_management() from public,anon;
revoke all on function public.is_portfolio_reviewer() from public,anon;
revoke all on function public.is_guild_admin() from public,anon;
grant execute on function public.is_portfolio_management() to authenticated;
grant execute on function public.is_portfolio_reviewer() to authenticated;
grant execute on function public.is_guild_admin() to authenticated;

create table if not exists public.portfolio_update_rounds (
 id uuid primary key default gen_random_uuid(),
 round_name text not null check(char_length(trim(round_name)) between 1 and 120),
 starts_at timestamptz not null,
 closes_at timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 archived_by uuid references auth.users(id) on delete set null,
 constraint portfolio_update_rounds_dates_check check(closes_at>starts_at)
);

create table if not exists public.portfolios (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.guild_members(user_id) on delete cascade,
 title text not null,
 description text,
 game_class text not null check(game_class in ('Ironclad','Bloodstrom','Numina','Nightwaker','Sylph','Dragonsvelte','Celestune','Mystech')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 portfolio_type text not null default 'pvp' check(portfolio_type in ('pvp','pve','cultivation_skills'))
);

create table if not exists public.portfolio_versions (
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 version_number integer not null check(version_number>=1),
 round_id uuid references public.portfolio_update_rounds(id) on delete set null,
 patch_label text,
 title text not null,
 description text,
 game_class text not null,
 portfolio_type text not null check(portfolio_type in ('pvp','pve','cultivation_skills')),
 created_by uuid references public.guild_members(user_id) on delete set null,
 created_at timestamptz not null default now(),
 version_name text not null default 'Version',
 constraint portfolio_versions_portfolio_version_unique unique(portfolio_id,version_number)
);

create table if not exists public.portfolio_version_images (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.portfolio_versions(id) on delete cascade,
 image_url text not null,
 cover_image_url text,
 crop_settings jsonb,
 image_type text not null default 'other' check(image_type in ('stats','equipment','inner_power','other')),
 section_key text not null default 'stats',
 caption text,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);

create table if not exists public.portfolio_patch_submissions (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete restrict,
 version_id uuid not null references public.portfolio_versions(id) on delete restrict,
 member_id uuid not null references public.guild_members(user_id) on delete cascade,
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint portfolio_patch_submissions_one_per_folder unique(round_id,portfolio_id)
);

create table if not exists public.portfolio_update_edit_permissions (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
 member_id uuid not null references public.guild_members(user_id) on delete cascade,
 granted_by uuid not null references auth.users(id) on delete restrict,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 constraint portfolio_update_edit_permissions_round_id_member_id_key unique(round_id,member_id)
);

create table if not exists public.portfolio_update_edit_requests (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
 member_id uuid not null references public.guild_members(user_id) on delete cascade,
 reason text not null check(char_length(trim(reason)) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);

-- Bring the already-created Staging fixture tables up to the inspected Production column contract.
alter table public.portfolio_versions
 add column if not exists round_id uuid references public.portfolio_update_rounds(id) on delete set null,
 add column if not exists patch_label text,
 add column if not exists description text,
 add column if not exists created_by uuid references public.guild_members(user_id) on delete set null;
alter table public.portfolio_version_images
 add column if not exists cover_image_url text,
 add column if not exists crop_settings jsonb,
 add column if not exists image_type text not null default 'other' check(image_type in ('stats','equipment','inner_power','other')),
 add column if not exists caption text,
 add column if not exists sort_order integer not null default 0;

create index if not exists portfolio_update_rounds_active_created_idx
 on public.portfolio_update_rounds(created_at desc) where archived_at is null;
create index if not exists idx_portfolios_member on public.portfolios(member_id);
create index if not exists idx_portfolios_class on public.portfolios(game_class);
create index if not exists portfolio_versions_portfolio_idx on public.portfolio_versions(portfolio_id,version_number desc);
create index if not exists portfolio_versions_round_idx on public.portfolio_versions(round_id,created_at);
create index if not exists portfolio_version_images_version_idx on public.portfolio_version_images(version_id,sort_order,created_at);
create index if not exists portfolio_patch_submissions_member_idx on public.portfolio_patch_submissions(member_id,round_id);
create index if not exists portfolio_patch_submissions_round_idx on public.portfolio_patch_submissions(round_id,submitted_at desc);
create index if not exists portfolio_patch_submissions_version_idx on public.portfolio_patch_submissions(version_id);
create index if not exists portfolio_update_requests_round_idx on public.portfolio_update_edit_requests(round_id,status);

alter table public.portfolio_update_rounds enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_versions enable row level security;
alter table public.portfolio_version_images enable row level security;
alter table public.portfolio_patch_submissions enable row level security;
alter table public.portfolio_update_edit_permissions enable row level security;
alter table public.portfolio_update_edit_requests enable row level security;

drop policy if exists "portfolio update rounds visible to members" on public.portfolio_update_rounds;
create policy "portfolio update rounds visible to members" on public.portfolio_update_rounds
 for select to authenticated using(true);
drop policy if exists "portfolio update rounds managed by management" on public.portfolio_update_rounds;
create policy "portfolio update rounds managed by management" on public.portfolio_update_rounds
 for all to authenticated using(public.is_portfolio_management()) with check(public.is_portfolio_management());

drop policy if exists "Members can view portfolios" on public.portfolios;
create policy "Members can view portfolios" on public.portfolios for select to authenticated using(public.is_guild_member());
drop policy if exists "Members can create own portfolios" on public.portfolios;
create policy "Members can create own portfolios" on public.portfolios for insert to authenticated
 with check(public.is_guild_member() and member_id=(select auth.uid()));
drop policy if exists "Members can update own portfolios" on public.portfolios;
create policy "Members can update own portfolios" on public.portfolios for update to authenticated
 using(member_id=(select auth.uid()) and public.is_guild_member())
 with check(member_id=(select auth.uid()) and public.is_guild_member());
drop policy if exists "Portfolio owners can delete own portfolios" on public.portfolios;
create policy "Portfolio owners can delete own portfolios" on public.portfolios for delete to authenticated
 using(member_id=(select auth.uid()) and public.is_guild_member());

drop policy if exists "Guild members can view portfolio versions" on public.portfolio_versions;
create policy "Guild members can view portfolio versions" on public.portfolio_versions for select to authenticated using(public.is_guild_member());
drop policy if exists "Owners can create portfolio versions" on public.portfolio_versions;
create policy "Owners can create portfolio versions" on public.portfolio_versions for insert to authenticated
 with check(public.is_guild_member() and exists(select 1 from public.portfolios p where p.id=portfolio_id and p.member_id=(select auth.uid())));
drop policy if exists "Owners can rename portfolio versions" on public.portfolio_versions;
create policy "Owners can rename portfolio versions" on public.portfolio_versions for update to authenticated
 using(public.is_guild_member() and exists(select 1 from public.portfolios p where p.id=portfolio_id and p.member_id=(select auth.uid())))
 with check(public.is_guild_member() and exists(select 1 from public.portfolios p where p.id=portfolio_id and p.member_id=(select auth.uid())));
drop policy if exists "Owners can delete own portfolio versions" on public.portfolio_versions;
create policy "Owners can delete own portfolio versions" on public.portfolio_versions for delete to authenticated
 using(public.is_guild_member() and exists(select 1 from public.portfolios p where p.id=portfolio_id and p.member_id=(select auth.uid())));

drop policy if exists "Guild members can view version images" on public.portfolio_version_images;
create policy "Guild members can view version images" on public.portfolio_version_images for select to authenticated using(public.is_guild_member());
drop policy if exists "Owners can add version images" on public.portfolio_version_images;
create policy "Owners can add version images" on public.portfolio_version_images for insert to authenticated
 with check(public.is_guild_member() and exists(select 1 from public.portfolio_versions v join public.portfolios p on p.id=v.portfolio_id where v.id=version_id and p.member_id=(select auth.uid())));

drop policy if exists "portfolio patch submissions visible to guild members" on public.portfolio_patch_submissions;
create policy "portfolio patch submissions visible to guild members" on public.portfolio_patch_submissions
 for select to authenticated using(public.is_guild_member());

drop policy if exists "portfolio update permissions visible to owner or management" on public.portfolio_update_edit_permissions;
create policy "portfolio update permissions visible to owner or management" on public.portfolio_update_edit_permissions
 for select to authenticated using(member_id=(select auth.uid()) or public.is_portfolio_management());
drop policy if exists "portfolio update permissions managed by management" on public.portfolio_update_edit_permissions;
create policy "portfolio update permissions managed by management" on public.portfolio_update_edit_permissions
 for all to authenticated using(public.is_portfolio_management()) with check(public.is_portfolio_management());

drop policy if exists "portfolio update requests visible to owner or management" on public.portfolio_update_edit_requests;
create policy "portfolio update requests visible to owner or management" on public.portfolio_update_edit_requests
 for select to authenticated using(member_id=(select auth.uid()) or public.is_portfolio_management());
drop policy if exists "portfolio update requests owner insert" on public.portfolio_update_edit_requests;
create policy "portfolio update requests owner insert" on public.portfolio_update_edit_requests
 for insert to authenticated with check(
  member_id=(select auth.uid()) and exists(select 1 from public.portfolio_update_rounds r
   where r.id=portfolio_update_edit_requests.round_id and r.archived_at is null and (r.status='closed' or now()>r.closes_at))
 );
drop policy if exists "portfolio update requests management update" on public.portfolio_update_edit_requests;
create policy "portfolio update requests management update" on public.portfolio_update_edit_requests
 for update to authenticated using(public.is_portfolio_management())
 with check(public.is_portfolio_management());

grant select,insert,update,delete on public.portfolio_update_rounds,public.portfolios,public.portfolio_versions,
 public.portfolio_version_images,public.portfolio_patch_submissions,public.portfolio_update_edit_permissions,
 public.portfolio_update_edit_requests to authenticated;

-- Minimal synthetic fixtures. No image objects or real Storage URLs are copied.
insert into public.portfolio_update_rounds(id,round_name,starts_at,closes_at,status,created_by)
values('b58f481c-44b5-451d-b55e-6d270429ebbe','Synthetic Patch 2.1',now()-interval '1 day',now()+interval '7 days','open','10000000-0000-4000-8000-000000000001')
on conflict(id) do nothing;

insert into public.portfolios(id,member_id,title,game_class,portfolio_type)
values
('843eb21a-49d2-4a6c-bd18-8532dab1ef53','10000000-0000-4000-8000-000000000001','Astra PvP Build','Ironclad','pvp'),
('44576645-a322-4495-b50e-bddea7725246','10000000-0000-4000-8000-000000000004','Oracle PvP Build','Numina','pvp')
on conflict(id) do nothing;

insert into public.portfolio_versions(id,portfolio_id,version_number,version_name,title,game_class,portfolio_type,created_by)
values
('3d6c7a6c-79a7-42b4-ab74-16508091ad47','843eb21a-49d2-4a6c-bd18-8532dab1ef53',1,'Version 1','Astra PvP Build','Ironclad','pvp','10000000-0000-4000-8000-000000000001'),
('16b20cb6-e5ca-4d1d-b6b0-59ccd5b6540c','44576645-a322-4495-b50e-bddea7725246',1,'Version 1','Oracle PvP Build','Numina','pvp','10000000-0000-4000-8000-000000000004')
on conflict(id) do nothing;

insert into public.portfolio_patch_submissions(round_id,portfolio_id,version_id,member_id)
values
('b58f481c-44b5-451d-b55e-6d270429ebbe','843eb21a-49d2-4a6c-bd18-8532dab1ef53','3d6c7a6c-79a7-42b4-ab74-16508091ad47','10000000-0000-4000-8000-000000000001'),
('b58f481c-44b5-451d-b55e-6d270429ebbe','44576645-a322-4495-b50e-bddea7725246','16b20cb6-e5ca-4d1d-b6b0-59ccd5b6540c','10000000-0000-4000-8000-000000000004')
on conflict(round_id,portfolio_id) do nothing;

commit;
