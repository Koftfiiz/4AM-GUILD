-- Query name: 4AM Discord Integration Settings
-- Purpose: Create Developer-only Discord bot configuration with TEST MODE as the safe default.
-- Run this entire script in Supabase SQL Editor before using the new settings page.

begin;

create or replace function public.is_active_4am_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guild_members gm
    where gm.user_id = auth.uid()
      and lower(coalesce(gm.role, '')) = 'developer'
      and gm.active is true
  );
$$;

revoke all on function public.is_active_4am_developer() from public;
grant execute on function public.is_active_4am_developer() to authenticated;

create table if not exists public.guild_discord_integration_settings (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'test' check (mode in ('test','production')),
  test_channel_id text,
  production_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.guild_discord_event_routes (
  event_key text primary key,
  event_label text not null,
  enabled boolean not null default false,
  channel_id text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.guild_discord_integration_settings (id, mode, production_enabled)
values (1, 'test', false)
on conflict (id) do nothing;

insert into public.guild_discord_event_routes (event_key, event_label, enabled)
values
  ('guild_activity_published', 'ประกาศข่าวสาร / กิจกรรมกิลด์', false),
  ('guild_activity_comment', 'ความคิดเห็นในกิจกรรมกิลด์', false),
  ('feedback_submitted', 'แจ้งปัญหา / Feedback', false),
  ('duck_race_results', 'ผลการแข่งขัน Duck Race', false),
  ('member_joined', 'สมาชิกใหม่ / เพิ่มสมาชิก', false),
  ('war_signup_submitted', 'ลงชื่อเข้าร่วม Guild War', false),
  ('war_leave_submitted', 'แจ้งลาวอร์', false),
  ('portfolio_published', 'โพสต์แฟ้มผลงาน', false)
on conflict (event_key) do nothing;

alter table public.guild_discord_integration_settings enable row level security;
alter table public.guild_discord_event_routes enable row level security;

drop policy if exists "4AM developers can manage Discord integration settings" on public.guild_discord_integration_settings;
create policy "4AM developers can manage Discord integration settings"
on public.guild_discord_integration_settings
for all
to authenticated
using (public.is_active_4am_developer())
with check (public.is_active_4am_developer());

drop policy if exists "4AM developers can manage Discord event routes" on public.guild_discord_event_routes;
create policy "4AM developers can manage Discord event routes"
on public.guild_discord_event_routes
for all
to authenticated
using (public.is_active_4am_developer())
with check (public.is_active_4am_developer());

grant select, insert, update, delete on public.guild_discord_integration_settings to authenticated;
grant select, insert, update, delete on public.guild_discord_event_routes to authenticated;

commit;

-- Verification:
-- 1) SELECT * FROM public.guild_discord_integration_settings;
-- 2) SELECT event_key, event_label, enabled, channel_id FROM public.guild_discord_event_routes ORDER BY event_key;
-- 3) SELECT public.is_active_4am_developer();
-- Run checks 1-2 while signed in as Developer; non-Developer accounts should receive no rows / permission denied by RLS.
