-- Query Name: 4AM_GUILD_GAME_GUIDES_SETUP
-- Type: DDL + RLS + Storage Policy
-- Adds community-authored game guides. Existing guild data is untouched.

begin;

create table if not exists public.guild_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  category text not null default 'ทั่วไป' check (char_length(trim(category)) between 1 and 60),
  content_html text not null check (char_length(trim(content_html)) between 1 and 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_guides_created_idx
  on public.guild_guides(created_at desc);
create index if not exists guild_guides_category_created_idx
  on public.guild_guides(category, created_at desc);
create index if not exists guild_guides_owner_created_idx
  on public.guild_guides(user_id, created_at desc);

alter table public.guild_guides enable row level security;
grant select, insert, update, delete on public.guild_guides to authenticated;

drop policy if exists "Active guild members can read guides" on public.guild_guides;
create policy "Active guild members can read guides"
on public.guild_guides for select to authenticated
using (
  exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
);

drop policy if exists "Active guild members can create own guides" on public.guild_guides;
create policy "Active guild members can create own guides"
on public.guild_guides for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
);

drop policy if exists "Owners and management can update guides" on public.guild_guides;
create policy "Owners and management can update guides"
on public.guild_guides for update to authenticated
using (
  (user_id = auth.uid() or public.is_war_manager())
  and exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
)
with check (
  (user_id = auth.uid() or public.is_war_manager())
  and exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
);

drop policy if exists "Owners and management can delete guides" on public.guild_guides;
create policy "Owners and management can delete guides"
on public.guild_guides for delete to authenticated
using (
  (user_id = auth.uid() or public.is_war_manager())
  and exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
);

-- The existing public guild-activity image bucket is reused for guide images.
-- Each member may upload only inside their own /guides/ folder.
drop policy if exists "Active guild members upload guide images" on storage.objects;
create policy "Active guild members upload guide images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'guild-activity-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'guides'
  and exists (select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true)
);

commit;
