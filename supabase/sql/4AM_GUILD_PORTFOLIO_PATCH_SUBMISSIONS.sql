-- 4AM GUILD: decouple Portfolio Versions from Patch submissions.
-- Portfolio folders and immutable Versions can be created at any time.
-- A member explicitly selects one Version per folder for each Patch round.

create table if not exists public.portfolio_patch_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  version_id uuid not null references public.portfolio_versions(id) on delete restrict,
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_patch_submissions_one_per_folder unique (round_id, portfolio_id)
);

create index if not exists portfolio_patch_submissions_round_idx
  on public.portfolio_patch_submissions(round_id, submitted_at desc);
create index if not exists portfolio_patch_submissions_member_idx
  on public.portfolio_patch_submissions(member_id, round_id);
create index if not exists portfolio_patch_submissions_version_idx
  on public.portfolio_patch_submissions(version_id);

alter table public.portfolio_patch_submissions enable row level security;

drop policy if exists "portfolio patch submissions visible to guild members"
  on public.portfolio_patch_submissions;
create policy "portfolio patch submissions visible to guild members"
  on public.portfolio_patch_submissions
  for select to authenticated
  using (public.is_guild_member());

revoke all on public.portfolio_patch_submissions from anon, authenticated;
grant select on public.portfolio_patch_submissions to authenticated;

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
      and r.archived_at is null
      and r.status = 'open'
      and now() >= r.starts_at
      and now() <= r.closes_at
  )
  or exists (
    select 1
    from public.portfolio_update_edit_permissions ep
    join public.portfolio_update_rounds r on r.id = ep.round_id
    join public.guild_members gm on gm.user_id = auth.uid() and gm.active = true
    where ep.round_id = target_round_id
      and ep.member_id = auth.uid()
      and ep.expires_at > now()
      and r.archived_at is null
  );
$$;

-- Archived rounds cannot receive new late-edit requests.
drop policy if exists "portfolio update requests owner insert"
  on public.portfolio_update_edit_requests;
create policy "portfolio update requests owner insert"
  on public.portfolio_update_edit_requests
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and exists (
      select 1 from public.portfolio_update_rounds r
      where r.id = round_id
        and r.archived_at is null
        and (r.status = 'closed' or now() > r.closes_at)
    )
  );

-- New Versions are neutral Portfolio history. They are never auto-attached to a Patch.
create or replace function public.assign_portfolio_version_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  parent_portfolio public.portfolios%rowtype;
  next_version integer;
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
  new.round_id := null;
  new.patch_label := null;
  return new;
end;
$function$;

create or replace function public.submit_portfolio_patch(
  target_round_id uuid,
  target_portfolio_id uuid,
  target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_member_id uuid := (select auth.uid());
  saved_submission_id uuid;
  saved_submitted_at timestamptz;
begin
  if current_member_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = current_member_id and gm.active = true
  ) then
    raise exception 'Active guild membership required';
  end if;

  if not exists (
    select 1 from public.portfolios p
    where p.id = target_portfolio_id and p.member_id = current_member_id
  ) then
    raise exception 'You can submit only your own Portfolio folder';
  end if;

  if not exists (
    select 1 from public.portfolio_versions pv
    where pv.id = target_version_id and pv.portfolio_id = target_portfolio_id
  ) then
    raise exception 'Selected Version does not belong to this Portfolio folder';
  end if;

  if not exists (
    select 1 from public.portfolio_update_rounds r
    where r.id = target_round_id
      and r.archived_at is null
      and (
        (r.status = 'open' and now() >= r.starts_at and now() <= r.closes_at)
        or exists (
          select 1 from public.portfolio_update_edit_permissions ep
          where ep.round_id = r.id
            and ep.member_id = current_member_id
            and ep.expires_at > now()
        )
      )
  ) then
    raise exception 'This Patch round is not accepting submissions or your late-submission permission has expired';
  end if;

  insert into public.portfolio_patch_submissions
    (round_id, portfolio_id, version_id, member_id)
  values
    (target_round_id, target_portfolio_id, target_version_id, current_member_id)
  on conflict (round_id, portfolio_id)
  do update set
    version_id = excluded.version_id,
    member_id = excluded.member_id,
    updated_at = now()
  returning id, submitted_at into saved_submission_id, saved_submitted_at;

  return jsonb_build_object(
    'success', true,
    'submission_id', saved_submission_id,
    'round_id', target_round_id,
    'portfolio_id', target_portfolio_id,
    'version_id', target_version_id,
    'submitted_at', saved_submitted_at
  );
end;
$function$;

revoke all on function public.submit_portfolio_patch(uuid,uuid,uuid) from public, anon;
grant execute on function public.submit_portfolio_patch(uuid,uuid,uuid) to authenticated;

comment on table public.portfolio_patch_submissions is
  'Explicit Patch submissions. One selected immutable Portfolio Version per folder per round; changing selection updates the same submission.';
comment on column public.portfolio_versions.round_id is
  'Legacy metadata only. New Portfolio Versions are not linked to Patch rounds; use portfolio_patch_submissions.';
