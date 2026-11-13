-- 4AM GUILD Portfolio Update Rounds & Submission Tracker
-- Run once in Supabase SQL Editor. Existing Portfolio / image records are preserved.

create table if not exists public.portfolio_update_rounds (
  id uuid primary key default gen_random_uuid(),
  round_name text not null check (char_length(trim(round_name)) between 1 and 120),
  starts_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_update_rounds_dates_check check (closes_at > starts_at)
);

create table if not exists public.portfolio_update_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  category_key text not null check (category_key in ('cultivation','skills')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, member_id, category_key)
);

create table if not exists public.portfolio_update_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.portfolio_update_submissions(id) on delete cascade,
  image_path text not null,
  caption text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_update_edit_requests (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_update_edit_permissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (round_id, member_id)
);

create index if not exists portfolio_update_submissions_round_idx on public.portfolio_update_submissions(round_id);
create index if not exists portfolio_update_submissions_member_idx on public.portfolio_update_submissions(member_id);
create index if not exists portfolio_update_images_submission_idx on public.portfolio_update_images(submission_id, sort_order);
create index if not exists portfolio_update_requests_round_idx on public.portfolio_update_edit_requests(round_id, status);

create or replace function public.is_portfolio_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and gm.active = true
      and lower(coalesce(gm.role,'')) in ('developer','leader','management')
  );
$$;

create or replace function public.can_edit_portfolio_update(target_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfolio_update_rounds r
    join public.guild_members gm on gm.user_id = auth.uid() and gm.active = true
    where r.id = target_round_id
      and r.status = 'open'
      and now() >= r.starts_at
      and now() <= r.closes_at
  )
  or exists (
    select 1
    from public.portfolio_update_edit_permissions ep
    join public.guild_members gm on gm.user_id = auth.uid() and gm.active = true
    where ep.round_id = target_round_id
      and ep.member_id = auth.uid()
      and ep.expires_at > now()
  );
$$;

create or replace function public.touch_portfolio_update_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_update_rounds_touch on public.portfolio_update_rounds;
create trigger portfolio_update_rounds_touch before update on public.portfolio_update_rounds
for each row execute function public.touch_portfolio_update_timestamp();

drop trigger if exists portfolio_update_submissions_touch on public.portfolio_update_submissions;
create trigger portfolio_update_submissions_touch before update on public.portfolio_update_submissions
for each row execute function public.touch_portfolio_update_timestamp();

alter table public.portfolio_update_rounds enable row level security;
alter table public.portfolio_update_submissions enable row level security;
alter table public.portfolio_update_images enable row level security;
alter table public.portfolio_update_edit_requests enable row level security;
alter table public.portfolio_update_edit_permissions enable row level security;

drop policy if exists "portfolio update rounds visible to members" on public.portfolio_update_rounds;
create policy "portfolio update rounds visible to members" on public.portfolio_update_rounds
for select to authenticated using (true);
drop policy if exists "portfolio update rounds managed by management" on public.portfolio_update_rounds;
create policy "portfolio update rounds managed by management" on public.portfolio_update_rounds
for all to authenticated using (public.is_portfolio_management()) with check (public.is_portfolio_management());

drop policy if exists "portfolio update submissions visible to members" on public.portfolio_update_submissions;
create policy "portfolio update submissions visible to members" on public.portfolio_update_submissions
for select to authenticated using (true);
drop policy if exists "portfolio update submissions owner insert" on public.portfolio_update_submissions;
create policy "portfolio update submissions owner insert" on public.portfolio_update_submissions
for insert to authenticated with check (
  member_id = auth.uid() and public.can_edit_portfolio_update(round_id)
);
drop policy if exists "portfolio update submissions owner update" on public.portfolio_update_submissions;
create policy "portfolio update submissions owner update" on public.portfolio_update_submissions
for update to authenticated using (
  member_id = auth.uid() and public.can_edit_portfolio_update(round_id)
) with check (
  member_id = auth.uid() and public.can_edit_portfolio_update(round_id)
);

drop policy if exists "portfolio update images visible to members" on public.portfolio_update_images;
create policy "portfolio update images visible to members" on public.portfolio_update_images
for select to authenticated using (true);
drop policy if exists "portfolio update images owner insert" on public.portfolio_update_images;
create policy "portfolio update images owner insert" on public.portfolio_update_images
for insert to authenticated with check (
  exists (
    select 1 from public.portfolio_update_submissions s
    where s.id = submission_id and s.member_id = auth.uid()
      and public.can_edit_portfolio_update(s.round_id)
  )
);
drop policy if exists "portfolio update images owner update" on public.portfolio_update_images;
create policy "portfolio update images owner update" on public.portfolio_update_images
for update to authenticated using (
  exists (
    select 1 from public.portfolio_update_submissions s
    where s.id = submission_id and s.member_id = auth.uid()
      and public.can_edit_portfolio_update(s.round_id)
  )
) with check (
  exists (
    select 1 from public.portfolio_update_submissions s
    where s.id = submission_id and s.member_id = auth.uid()
      and public.can_edit_portfolio_update(s.round_id)
  )
);
drop policy if exists "portfolio update images owner delete" on public.portfolio_update_images;
create policy "portfolio update images owner delete" on public.portfolio_update_images
for delete to authenticated using (
  exists (
    select 1 from public.portfolio_update_submissions s
    where s.id = submission_id and s.member_id = auth.uid()
      and public.can_edit_portfolio_update(s.round_id)
  )
);

drop policy if exists "portfolio update requests visible to owner or management" on public.portfolio_update_edit_requests;
create policy "portfolio update requests visible to owner or management" on public.portfolio_update_edit_requests
for select to authenticated using (member_id = auth.uid() or public.is_portfolio_management());
drop policy if exists "portfolio update requests owner insert" on public.portfolio_update_edit_requests;
create policy "portfolio update requests owner insert" on public.portfolio_update_edit_requests
for insert to authenticated with check (
  member_id = auth.uid()
  and exists (select 1 from public.portfolio_update_rounds r where r.id = round_id and (r.status = 'closed' or now() > r.closes_at))
);
drop policy if exists "portfolio update requests management update" on public.portfolio_update_edit_requests;
create policy "portfolio update requests management update" on public.portfolio_update_edit_requests
for update to authenticated using (public.is_portfolio_management()) with check (public.is_portfolio_management());

drop policy if exists "portfolio update permissions visible to owner or management" on public.portfolio_update_edit_permissions;
create policy "portfolio update permissions visible to owner or management" on public.portfolio_update_edit_permissions
for select to authenticated using (member_id = auth.uid() or public.is_portfolio_management());
drop policy if exists "portfolio update permissions managed by management" on public.portfolio_update_edit_permissions;
create policy "portfolio update permissions managed by management" on public.portfolio_update_edit_permissions
for all to authenticated using (public.is_portfolio_management()) with check (public.is_portfolio_management());

grant execute on function public.is_portfolio_management() to authenticated;
grant execute on function public.can_edit_portfolio_update(uuid) to authenticated;

-- Build portfolios store each uploaded image in a dedicated review section.
alter table public.portfolio_images add column if not exists section_key text not null default 'stats';
comment on column public.portfolio_images.section_key is 'Build image section: stats, inner_power, or affixes. Legacy images default to stats.';
