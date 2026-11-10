-- 4AM GUILD Appearance System — run once in Supabase SQL Editor
create table if not exists public.member_appearance_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 theme_id text not null default '4am-original',
 custom_tokens jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.member_appearance_preferences enable row level security;
drop policy if exists "Members read own appearance" on public.member_appearance_preferences;
create policy "Members read own appearance" on public.member_appearance_preferences for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Members insert own appearance" on public.member_appearance_preferences;
create policy "Members insert own appearance" on public.member_appearance_preferences for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Members update own appearance" on public.member_appearance_preferences;
create policy "Members update own appearance" on public.member_appearance_preferences for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.guild_appearance_settings (
 id boolean primary key default true check(id=true),
 default_theme_id text not null default '4am-original',
 active_logo_url text,
 logo_library jsonb not null default '[]'::jsonb,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.guild_appearance_settings enable row level security;
drop policy if exists "Authenticated read guild appearance" on public.guild_appearance_settings;
create policy "Authenticated read guild appearance" on public.guild_appearance_settings for select to authenticated using(true);
drop policy if exists "Management insert guild appearance" on public.guild_appearance_settings;
create policy "Management insert guild appearance" on public.guild_appearance_settings for insert to authenticated with check(exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management')));
drop policy if exists "Management update guild appearance" on public.guild_appearance_settings;
create policy "Management update guild appearance" on public.guild_appearance_settings for update to authenticated using(exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management'))) with check(exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management')));
insert into public.guild_appearance_settings(id,default_theme_id,active_logo_url,logo_library)
values(true,'4am-original','https://i.postimg.cc/xqVN8XTs/4AM-Logo.png','[{"name":"4AM Guild New Logo","url":"https://i.postimg.cc/xqVN8XTs/4AM-Logo.png"}]'::jsonb) on conflict(id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('guild-assets','guild-assets',true,5242880,array['image/png','image/jpeg','image/webp','image/gif']) on conflict(id) do nothing;
drop policy if exists "Guild assets public read" on storage.objects;
create policy "Guild assets public read" on storage.objects for select to public using(bucket_id='guild-assets');
drop policy if exists "Management upload guild assets" on storage.objects;
create policy "Management upload guild assets" on storage.objects for insert to authenticated with check(bucket_id='guild-assets' and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management')));
drop policy if exists "Management update guild assets" on storage.objects;
create policy "Management update guild assets" on storage.objects for update to authenticated using(bucket_id='guild-assets' and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management')));
drop policy if exists "Management delete guild assets" on storage.objects;
create policy "Management delete guild assets" on storage.objects for delete to authenticated using(bucket_id='guild-assets' and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and lower(gm.role) in('developer','leader','management')));
