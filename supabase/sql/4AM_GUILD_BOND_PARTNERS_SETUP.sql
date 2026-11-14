-- 4AM GUILD Bond Partner Relationships
-- Query name: 4AM_GUILD_BOND_PARTNERS_SETUP
-- Run once in Supabase SQL Editor. Existing guild_members.bond_names values are preserved.

begin;

create table if not exists public.guild_member_bonds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.guild_members(user_id) on delete cascade,
  partner_member_id uuid not null references public.guild_members(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint guild_member_bonds_no_self check (member_id <> partner_member_id),
  constraint guild_member_bonds_unique_pair unique (member_id, partner_member_id)
);

create index if not exists idx_guild_member_bonds_partner
  on public.guild_member_bonds (partner_member_id);

alter table public.guild_member_bonds enable row level security;

drop policy if exists "Active guild members can view bond relationships" on public.guild_member_bonds;
create policy "Active guild members can view bond relationships"
  on public.guild_member_bonds
  for select
  to authenticated
  using (
    exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid()
        and gm.active is true
    )
  );

drop policy if exists "Members can add their own bond relationships" on public.guild_member_bonds;
create policy "Members can add their own bond relationships"
  on public.guild_member_bonds
  for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and exists (
      select 1 from public.guild_members owner_member
      where owner_member.user_id = auth.uid()
        and owner_member.active is true
    )
    and exists (
      select 1 from public.guild_members partner_member
      where partner_member.user_id = partner_member_id
        and partner_member.active is true
    )
  );

drop policy if exists "Members can remove their own bond relationships" on public.guild_member_bonds;
create policy "Members can remove their own bond relationships"
  on public.guild_member_bonds
  for delete
  to authenticated
  using (member_id = auth.uid());

grant select, insert, delete on public.guild_member_bonds to authenticated;

comment on table public.guild_member_bonds is
  'Directional bond partner selections. Each member manages only the partners they selected. A bond can be displayed in War Party when either member selected the other.';

commit;
