-- Staging-only additive repair after the initial synthetic baseline was applied.
-- No Production data or credentials are used.

begin;

create table if not exists public.discord_accounts (
  user_id uuid primary key references public.guild_members(user_id) on delete cascade,
  discord_user_id text unique,
  discord_username text,
  discord_global_name text,
  verified boolean not null default false,
  guild_member_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.discord_accounts enable row level security;
drop policy if exists discord_accounts_read_owner_or_management on public.discord_accounts;
create policy discord_accounts_read_owner_or_management
  on public.discord_accounts for select to authenticated
  using (user_id=(select auth.uid()) or public.is_guild_admin());
grant select on public.discord_accounts to authenticated;

insert into public.discord_accounts(user_id,discord_user_id,discord_username,discord_global_name,verified,guild_member_verified) values
('10000000-0000-4000-8000-000000000001','900000000000000001','astra#0412','AstraKnight',true,true),
('10000000-0000-4000-8000-000000000002','900000000000000002','crimsonvow','CrimsonVow',true,true),
('10000000-0000-4000-8000-000000000003','900000000000000003','moon.celeste','MoonCeleste',false,false),
('10000000-0000-4000-8000-000000000004','900000000000000004','pinkoracle','PinkOracle',true,true),
('10000000-0000-4000-8000-000000000005','900000000000000005','dragonheart','DragonHeart',false,false),
('10000000-0000-4000-8000-000000000006','900000000000000006','silvershield','SilverShield',true,true)
on conflict (user_id) do nothing;

drop index if exists public.guild_member_affiliations_current_user_uidx;
drop index if exists public.guild_member_affiliations_current_manual_uidx;
create unique index if not exists guild_member_affiliations_one_current_user
  on public.guild_member_affiliations(user_id)
  where user_id is not null and ended_at is null;
create unique index if not exists guild_member_affiliations_one_current_manual
  on public.guild_member_affiliations(manual_member_id)
  where manual_member_id is not null and ended_at is null;

drop policy if exists affiliations_read_self_or_admin on public.guild_member_affiliations;
drop policy if exists affiliations_admin_insert on public.guild_member_affiliations;
drop policy if exists affiliations_admin_update on public.guild_member_affiliations;
drop policy if exists "Members can view own guild affiliation" on public.guild_member_affiliations;
create policy "Members can view own guild affiliation"
  on public.guild_member_affiliations for select to authenticated
  using (
    user_id=(select auth.uid())
    or exists (
      select 1 from public.guild_manual_members mm
      where mm.id=guild_member_affiliations.manual_member_id
        and mm.linked_user_id=(select auth.uid())
    )
    or public.is_guild_admin()
  );
drop policy if exists "Leaders, Management, and Developers can manage member affiliations" on public.guild_member_affiliations;
create policy "Leaders, Management, and Developers can manage member affiliations"
  on public.guild_member_affiliations for all to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

alter table public.portfolio_patch_roster
  drop constraint if exists portfolio_patch_roster_roster_source_check;
alter table public.portfolio_patch_roster
  add constraint portfolio_patch_roster_roster_source_check
  check (roster_source in ('opening_snapshot','affiliation_transfer','manual_link'));

-- Match the already-inspected Production FK delete semantics in the Staging test schema.
alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_round_id_fkey,
  drop constraint if exists portfolio_patch_submissions_portfolio_id_fkey,
  drop constraint if exists portfolio_patch_submissions_version_id_fkey,
  drop constraint if exists portfolio_patch_submissions_member_id_fkey;
alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_round_id_fkey
    foreign key (round_id) references public.portfolio_update_rounds(id) on delete cascade,
  add constraint portfolio_patch_submissions_portfolio_id_fkey
    foreign key (portfolio_id) references public.portfolios(id) on delete restrict,
  add constraint portfolio_patch_submissions_version_id_fkey
    foreign key (version_id) references public.portfolio_versions(id) on delete restrict,
  add constraint portfolio_patch_submissions_member_id_fkey
    foreign key (member_id) references public.guild_members(user_id) on delete cascade;