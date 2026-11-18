-- Phase 1: 4AM/4PM guild affiliation foundation.
-- Additive and idempotent. Existing member IDs and legacy foreign keys stay unchanged.

begin;

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('4AM','4PM')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.guilds(code,name,is_active)
values ('4AM','4AM GUILD',true),('4PM','4PM GUILD',true)
on conflict(code) do nothing;

create table if not exists public.guild_member_affiliations (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete restrict,
  user_id uuid references public.guild_members(user_id) on delete restrict,
  manual_member_id uuid references public.guild_manual_members(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guild_member_affiliations_one_identity check (num_nonnulls(user_id,manual_member_id)=1),
  constraint guild_member_affiliations_valid_period check (ended_at is null or ended_at>started_at)
);

create unique index if not exists guild_member_affiliations_one_current_user
  on public.guild_member_affiliations(user_id)
  where user_id is not null and ended_at is null;
create unique index if not exists guild_member_affiliations_one_current_manual
  on public.guild_member_affiliations(manual_member_id)
  where manual_member_id is not null and ended_at is null;
create index if not exists guild_member_affiliations_current_guild_idx
  on public.guild_member_affiliations(guild_id,started_at desc) where ended_at is null;
create index if not exists guild_member_affiliations_user_history_idx
  on public.guild_member_affiliations(user_id,started_at desc) where user_id is not null;
create index if not exists guild_member_affiliations_manual_history_idx
  on public.guild_member_affiliations(manual_member_id,started_at desc) where manual_member_id is not null;

create or replace function public.can_manage_guild_affiliations()
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid())='378b09df-16a0-4d01-8908-2604c2c210a9'::uuid
    or exists(
      select 1 from public.guild_members gm
      where gm.user_id=(select auth.uid())
        and gm.active=true and gm.membership_status='active'
        and gm.role in ('management','leader','developer')
    );
$$;
revoke all on function public.can_manage_guild_affiliations() from public,anon;
grant execute on function public.can_manage_guild_affiliations() to authenticated;

alter table public.guilds enable row level security;
alter table public.guild_member_affiliations enable row level security;

drop policy if exists "Authenticated users can view active guilds" on public.guilds;
create policy "Authenticated users can view active guilds"
  on public.guilds for select to authenticated
  using (is_active=true or public.can_manage_guild_affiliations());
drop policy if exists "Leaders, Management, and Developers can manage guilds" on public.guilds;
create policy "Leaders, Management, and Developers can manage guilds"
  on public.guilds for all to authenticated
  using (public.can_manage_guild_affiliations())
  with check (public.can_manage_guild_affiliations());

drop policy if exists "Members can view own guild affiliation" on public.guild_member_affiliations;
create policy "Members can view own guild affiliation"
  on public.guild_member_affiliations for select to authenticated
  using (
    user_id=(select auth.uid())
    or exists(select 1 from public.guild_manual_members mm
      where mm.id=guild_member_affiliations.manual_member_id
        and mm.linked_user_id=(select auth.uid()))
    or public.can_manage_guild_affiliations()
  );
drop policy if exists "Leaders, Management, and Developers can manage member affiliations" on public.guild_member_affiliations;
create policy "Leaders, Management, and Developers can manage member affiliations"
  on public.guild_member_affiliations for all to authenticated
  using (public.can_manage_guild_affiliations())
  with check (public.can_manage_guild_affiliations());

grant select,insert,update,delete on public.guilds to authenticated;
grant select,insert,update,delete on public.guild_member_affiliations to authenticated;

commit;
