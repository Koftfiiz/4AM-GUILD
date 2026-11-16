-- 4AM GUILD: append-only Portfolio version history
-- Additive migration. Existing portfolios, images, reviews, and Storage objects are preserved.

create table if not exists public.portfolio_versions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  round_id uuid references public.portfolio_update_rounds(id) on delete set null,
  patch_label text,
  title text not null,
  description text,
  game_class text not null,
  portfolio_type text not null check (portfolio_type in ('pvp','pve','cultivation_skills')),
  created_by uuid references public.guild_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint portfolio_versions_portfolio_version_unique unique (portfolio_id, version_number)
);

create table if not exists public.portfolio_version_images (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.portfolio_versions(id) on delete cascade,
  image_url text not null,
  cover_image_url text,
  crop_settings jsonb,
  image_type text not null default 'other'
    check (image_type in ('stats','equipment','inner_power','other')),
  section_key text not null default 'stats',
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_version_reviews (
  version_id uuid primary key references public.portfolio_versions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_version_reviews_reason_check check (
    (status = 'rejected' and nullif(btrim(reason), '') is not null)
    or (status in ('pending','approved') and reason is null)
  )
);

create index if not exists portfolio_versions_portfolio_idx
  on public.portfolio_versions(portfolio_id, version_number desc);
create index if not exists portfolio_versions_round_idx
  on public.portfolio_versions(round_id, created_at);
create index if not exists portfolio_version_images_version_idx
  on public.portfolio_version_images(version_id, sort_order, created_at);

-- Disable version triggers during the idempotent legacy backfill. They are recreated below.
drop trigger if exists portfolio_versions_assign_metadata on public.portfolio_versions;
drop trigger if exists portfolio_versions_initialize_review on public.portfolio_versions;
drop trigger if exists portfolio_versions_touch_folder on public.portfolio_versions;

-- Convert every existing folder into Version 1, preserving original timestamps.
insert into public.portfolio_versions
  (portfolio_id, version_number, round_id, patch_label, title, description,
   game_class, portfolio_type, created_by, created_at)
select p.id, 1, r.id, r.round_name, p.title, p.description,
       p.game_class, p.portfolio_type, p.member_id, p.created_at
from public.portfolios p
left join lateral (
  select pur.id, pur.round_name
  from public.portfolio_update_rounds pur
  where p.created_at >= pur.starts_at and p.created_at <= pur.closes_at
  order by pur.starts_at desc, pur.created_at desc
  limit 1
) r on true
on conflict (portfolio_id, version_number) do nothing;

-- Copy references to existing Storage objects; do not copy or delete the files.
insert into public.portfolio_version_images
  (version_id, image_url, cover_image_url, crop_settings, image_type,
   section_key, caption, sort_order, created_at)
select pv.id, pi.image_url, pi.cover_image_url, pi.crop_settings, pi.image_type,
       pi.section_key, pi.caption, pi.sort_order, pi.created_at
from public.portfolio_images pi
join public.portfolio_versions pv
  on pv.portfolio_id = pi.portfolio_id and pv.version_number = 1
where not exists (
  select 1 from public.portfolio_version_images pvi
  where pvi.version_id = pv.id
    and pvi.image_url = pi.image_url
    and pvi.sort_order = pi.sort_order
);

-- Carry each existing review result into Version 1.
insert into public.portfolio_version_reviews
  (version_id, status, reason, reviewer_user_id, reviewed_at, created_at, updated_at)
select pv.id, pr.status, pr.reason, pr.reviewer_user_id, pr.reviewed_at, pr.created_at, pr.updated_at
from public.portfolio_reviews pr
join public.portfolio_versions pv
  on pv.portfolio_id = pr.portfolio_id and pv.version_number = 1
on conflict (version_id) do nothing;

alter table public.portfolio_versions enable row level security;
alter table public.portfolio_version_images enable row level security;
alter table public.portfolio_version_reviews enable row level security;

drop policy if exists "Guild members can view portfolio versions" on public.portfolio_versions;
create policy "Guild members can view portfolio versions"
on public.portfolio_versions for select to authenticated
using (public.is_guild_member());

drop policy if exists "Owners can create portfolio versions" on public.portfolio_versions;
create policy "Owners can create portfolio versions"
on public.portfolio_versions for insert to authenticated
with check (
  public.is_guild_member()
  and exists (
    select 1 from public.portfolios p
    where p.id = portfolio_id and p.member_id = (select auth.uid())
  )
);

drop policy if exists "Guild members can view version images" on public.portfolio_version_images;
create policy "Guild members can view version images"
on public.portfolio_version_images for select to authenticated
using (public.is_guild_member());

drop policy if exists "Owners can add version images" on public.portfolio_version_images;
create policy "Owners can add version images"
on public.portfolio_version_images for insert to authenticated
with check (
  public.is_guild_member()
  and exists (
    select 1
    from public.portfolio_versions pv
    join public.portfolios p on p.id = pv.portfolio_id
    where pv.id = version_id and p.member_id = (select auth.uid())
  )
);

drop policy if exists "Owners and reviewers can view version reviews" on public.portfolio_version_reviews;
create policy "Owners and reviewers can view version reviews"
on public.portfolio_version_reviews for select to authenticated
using (
  public.is_portfolio_reviewer()
  or exists (
    select 1
    from public.portfolio_versions pv
    join public.portfolios p on p.id = pv.portfolio_id
    where pv.id = version_id and p.member_id = (select auth.uid())
  )
);

drop policy if exists "Reviewers can update version reviews" on public.portfolio_version_reviews;
create policy "Reviewers can update version reviews"
on public.portfolio_version_reviews for update to authenticated
using (public.is_portfolio_reviewer())
with check (public.is_portfolio_reviewer());

grant select, insert on public.portfolio_versions to authenticated;
grant select, insert on public.portfolio_version_images to authenticated;
grant select, update on public.portfolio_version_reviews to authenticated;

-- Assign version numbers and immutable metadata snapshots at creation time.
create or replace function public.assign_portfolio_version_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  parent_portfolio public.portfolios%rowtype;
  next_version integer;
  active_round_id uuid;
  active_round_name text;
begin
  perform pg_advisory_xact_lock(hashtext(new.portfolio_id::text));

  select * into parent_portfolio
  from public.portfolios where id = new.portfolio_id;
  if not found then raise exception 'Portfolio folder not found'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.portfolio_versions where portfolio_id = new.portfolio_id;

  new.version_number := next_version;
  new.title := parent_portfolio.title;
  new.description := parent_portfolio.description;
  new.game_class := parent_portfolio.game_class;
  new.portfolio_type := parent_portfolio.portfolio_type;
  new.created_by := (select auth.uid());
  new.created_at := now();

  select id, round_name into active_round_id, active_round_name
  from public.portfolio_update_rounds
  where status = 'open' and now() >= starts_at and now() <= closes_at
  order by starts_at desc, created_at desc
  limit 1;

  new.round_id := active_round_id;
  new.patch_label := active_round_name;
  return new;
end;
$function$;

drop trigger if exists portfolio_versions_assign_metadata on public.portfolio_versions;
create trigger portfolio_versions_assign_metadata
before insert on public.portfolio_versions
for each row execute function public.assign_portfolio_version_metadata();

create or replace function public.initialize_portfolio_version_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.portfolio_version_reviews (version_id)
  values (new.id) on conflict (version_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists portfolio_versions_initialize_review on public.portfolio_versions;
create trigger portfolio_versions_initialize_review
after insert on public.portfolio_versions
for each row execute function public.initialize_portfolio_version_review();

create or replace function public.touch_portfolio_folder_after_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  update public.portfolios set updated_at = now() where id = new.portfolio_id;
  return new;
end;
$function$;

drop trigger if exists portfolio_versions_touch_folder on public.portfolio_versions;
create trigger portfolio_versions_touch_folder
after insert on public.portfolio_versions
for each row execute function public.touch_portfolio_folder_after_version();

create or replace function public.set_portfolio_version_review(
  target_version_id uuid,
  new_status text,
  rejection_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.is_portfolio_reviewer() then
    raise exception 'Only Developer, Leader and Management can review portfolio versions';
  end if;
  if target_version_id is null or new_status not in ('approved','rejected') then
    raise exception 'Invalid portfolio version review request';
  end if;
  if new_status = 'rejected' and nullif(btrim(rejection_reason), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  update public.portfolio_version_reviews
  set status = new_status,
      reason = case when new_status = 'rejected' then btrim(rejection_reason) else null end,
      reviewer_user_id = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where version_id = target_version_id;

  if not found then raise exception 'Portfolio version review record not found'; end if;
  return jsonb_build_object('success', true, 'version_id', target_version_id, 'status', new_status);
end;
$function$;

grant execute on function public.set_portfolio_version_review(uuid,text,text) to authenticated;

-- Transactional save for a complete new version. Storage uploads happen first;
-- this function commits the folder/version/image rows atomically.
create or replace function public.save_portfolio_version(
  target_portfolio_id uuid,
  create_new_folder boolean,
  folder_title text,
  folder_description text,
  folder_game_class text,
  folder_portfolio_type text,
  image_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  saved_portfolio_id uuid;
  saved_version_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.is_guild_member() then raise exception 'Active guild membership required'; end if;
  if target_portfolio_id is null
     or nullif(btrim(folder_title), '') is null
     or nullif(btrim(folder_game_class), '') is null
     or folder_portfolio_type not in ('pvp','pve','cultivation_skills')
     or jsonb_typeof(coalesce(image_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(image_payload, '[]'::jsonb)) < 1 then
    raise exception 'Invalid portfolio version payload';
  end if;

  if create_new_folder then
    insert into public.portfolios
      (id, member_id, title, description, game_class, portfolio_type)
    values
      (target_portfolio_id, (select auth.uid()), btrim(folder_title),
       folder_description, btrim(folder_game_class), folder_portfolio_type)
    returning id into saved_portfolio_id;
  else
    update public.portfolios
    set title = btrim(folder_title),
        description = folder_description,
        game_class = btrim(folder_game_class),
        portfolio_type = folder_portfolio_type
    where id = target_portfolio_id
      and member_id = (select auth.uid())
    returning id into saved_portfolio_id;
    if not found then raise exception 'Portfolio folder not found or not owned by current member'; end if;
  end if;

  insert into public.portfolio_versions (portfolio_id, title, game_class, portfolio_type)
  values (saved_portfolio_id, btrim(folder_title), btrim(folder_game_class), folder_portfolio_type)
  returning id into saved_version_id;

  insert into public.portfolio_version_images
    (version_id, image_url, cover_image_url, crop_settings, image_type,
     section_key, caption, sort_order)
  select
    saved_version_id, item.image_url, item.cover_image_url, item.crop_settings,
    coalesce(nullif(item.image_type, ''), 'other'),
    coalesce(nullif(item.section_key, ''), 'stats'),
    item.caption, coalesce(item.sort_order, 0)
  from jsonb_to_recordset(coalesce(image_payload, '[]'::jsonb)) as item(
    image_url text,
    cover_image_url text,
    crop_settings jsonb,
    image_type text,
    section_key text,
    caption text,
    sort_order integer
  );

  if not found then raise exception 'At least one version image is required'; end if;
  return jsonb_build_object('success', true, 'portfolio_id', saved_portfolio_id, 'version_id', saved_version_id);
end;
$function$;

grant execute on function public.save_portfolio_version(uuid,boolean,text,text,text,text,jsonb) to authenticated;

-- Transactional save for a complete new version. Storage uploads happen first;
-- this function commits the folder/version/image rows atomically.
create or replace function public.save_portfolio_version(
  target_portfolio_id uuid,
  create_new_folder boolean,
  folder_title text,
  folder_description text,
  folder_game_class text,
  folder_portfolio_type text,
  image_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  saved_portfolio_id uuid;
  saved_version_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.is_guild_member() then raise exception 'Active guild membership required'; end if;
  if target_portfolio_id is null
     or nullif(btrim(folder_title), '') is null
     or nullif(btrim(folder_game_class), '') is null
     or folder_portfolio_type not in ('pvp','pve','cultivation_skills')
     or jsonb_typeof(coalesce(image_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(image_payload, '[]'::jsonb)) < 1 then
    raise exception 'Invalid portfolio version payload';
  end if;

  if create_new_folder then
    insert into public.portfolios
      (id, member_id, title, description, game_class, portfolio_type)
    values
      (target_portfolio_id, (select auth.uid()), btrim(folder_title),
       folder_description, btrim(folder_game_class), folder_portfolio_type)
    returning id into saved_portfolio_id;
  else
    update public.portfolios
    set title = btrim(folder_title),
        description = folder_description,
        game_class = btrim(folder_game_class),
        portfolio_type = folder_portfolio_type
    where id = target_portfolio_id
      and member_id = (select auth.uid())
    returning id into saved_portfolio_id;
    if not found then raise exception 'Portfolio folder not found or not owned by current member'; end if;
  end if;

  insert into public.portfolio_versions (portfolio_id, title, game_class, portfolio_type)
  values (saved_portfolio_id, btrim(folder_title), btrim(folder_game_class), folder_portfolio_type)
  returning id into saved_version_id;

  insert into public.portfolio_version_images
    (version_id, image_url, cover_image_url, crop_settings, image_type,
     section_key, caption, sort_order)
  select
    saved_version_id, item.image_url, item.cover_image_url, item.crop_settings,
    coalesce(nullif(item.image_type, ''), 'other'),
    coalesce(nullif(item.section_key, ''), 'stats'),
    item.caption, coalesce(item.sort_order, 0)
  from jsonb_to_recordset(coalesce(image_payload, '[]'::jsonb)) as item(
    image_url text,
    cover_image_url text,
    crop_settings jsonb,
    image_type text,
    section_key text,
    caption text,
    sort_order integer
  );

  if not found then raise exception 'At least one version image is required'; end if;
  return jsonb_build_object('success', true, 'portfolio_id', saved_portfolio_id, 'version_id', saved_version_id);
end;
$function$;

grant execute on function public.save_portfolio_version(uuid,boolean,text,text,text,text,jsonb) to authenticated;

-- Trigger functions are not public RPC endpoints. Keep direct execution unavailable.
revoke all on function public.initialize_portfolio_version_review() from public, anon, authenticated;
revoke all on function public.touch_portfolio_folder_after_version() from public, anon, authenticated;
revoke all on function public.assign_portfolio_version_metadata() from public, anon, authenticated;
grant execute on function public.assign_portfolio_version_metadata() to authenticated;
grant execute on function public.touch_portfolio_folder_after_version() to authenticated;
revoke all on function public.set_portfolio_version_review(uuid,text,text) from public, anon;
grant execute on function public.set_portfolio_version_review(uuid,text,text) to authenticated;
revoke all on function public.save_portfolio_version(uuid,boolean,text,text,text,text,jsonb) from public, anon;
grant execute on function public.save_portfolio_version(uuid,boolean,text,text,text,text,jsonb) to authenticated;
