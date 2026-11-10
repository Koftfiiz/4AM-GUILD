-- 4AM GUILD: Skill catalog and per-member Skill assignments
-- Run once in Supabase SQL Editor for the production project.

create table if not exists public.war_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  game_class text not null,
  skill_name text not null,
  icon_path text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint war_skill_catalog_class_name_unique unique (game_class, skill_name)
);

create table if not exists public.guild_member_skills (
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  skill_id uuid not null references public.war_skill_catalog(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (member_id, skill_id)
);

alter table public.war_skill_catalog enable row level security;
alter table public.guild_member_skills enable row level security;

drop policy if exists "Authenticated users can view war skills" on public.war_skill_catalog;
create policy "Authenticated users can view war skills"
  on public.war_skill_catalog for select to authenticated using (true);

drop policy if exists "Management can insert war skills" on public.war_skill_catalog;
create policy "Management can insert war skills"
  on public.war_skill_catalog for insert to authenticated
  with check (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ));

drop policy if exists "Management can update war skills" on public.war_skill_catalog;
create policy "Management can update war skills"
  on public.war_skill_catalog for update to authenticated
  using (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ))
  with check (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ));

drop policy if exists "Management can delete war skills" on public.war_skill_catalog;
create policy "Management can delete war skills"
  on public.war_skill_catalog for delete to authenticated
  using (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ));

drop policy if exists "Authenticated users can view member skills" on public.guild_member_skills;
create policy "Authenticated users can view member skills"
  on public.guild_member_skills for select to authenticated using (true);

-- Member Skill changes are performed through the checked RPC below.
drop policy if exists "Management can manage member skills" on public.guild_member_skills;
create policy "Management can manage member skills"
  on public.guild_member_skills for all to authenticated
  using (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ))
  with check (exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('war-skill-icons', 'war-skill-icons', true, 3145728, array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Management can upload war skill icons" on storage.objects;
create policy "Management can upload war skill icons"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'war-skill-icons'
    and exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid()
        and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
    )
  );

drop policy if exists "Management can update war skill icons" on storage.objects;
create policy "Management can update war skill icons"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'war-skill-icons'
    and exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid()
        and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
    )
  )
  with check (
    bucket_id = 'war-skill-icons'
    and exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid()
        and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
    )
  );

drop policy if exists "Management can delete war skill icons" on storage.objects;
create policy "Management can delete war skill icons"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'war-skill-icons'
    and exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid()
        and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
    )
  );

create or replace function public.set_guild_member_skills(
  p_member_id uuid,
  p_skill_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class text;
begin
  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, 'member')) in ('developer','leader','management')
  ) then
    raise exception 'permission denied: management only';
  end if;

  select gm.game_class into target_class
  from public.guild_members gm
  where gm.user_id = p_member_id and gm.active = true;

  if target_class is null then
    raise exception 'member not found or inactive';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_skill_ids, array[]::uuid[])) as requested(skill_id)
    left join public.war_skill_catalog sc on sc.id = requested.skill_id
    where sc.id is null or lower(sc.game_class) <> lower(target_class)
  ) then
    raise exception 'one or more Skills do not match the member Class';
  end if;

  delete from public.guild_member_skills
  where member_id = p_member_id;

  insert into public.guild_member_skills (member_id, skill_id, assigned_by)
  select p_member_id, requested.skill_id, auth.uid()
  from (
    select distinct unnest(coalesce(p_skill_ids, array[]::uuid[])) as skill_id
  ) requested;
end;
$$;

revoke all on function public.set_guild_member_skills(uuid, uuid[]) from public;
grant execute on function public.set_guild_member_skills(uuid, uuid[]) to authenticated;
