-- Query Name: 4AM_GUILD_WAR_SIGNUP_SETUP
-- Type: DDL + RLS Policies
-- Impact: Adds member registration for upcoming war events. Existing war data is unchanged.
create table if not exists public.war_signups (
 id uuid primary key default gen_random_uuid(),
 war_event_id uuid not null references public.war_events(id) on delete cascade,
 member_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(war_event_id,member_id)
);
create index if not exists war_signups_event_id_idx on public.war_signups(war_event_id);
alter table public.war_signups enable row level security;
grant select,insert,delete on public.war_signups to authenticated;
drop policy if exists "Active members view war signups" on public.war_signups;
create policy "Active members view war signups" on public.war_signups for select to authenticated
using(exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and gm.active=true));
drop policy if exists "Members register themselves for war" on public.war_signups;
create policy "Members register themselves for war" on public.war_signups for insert to authenticated
with check(member_id=auth.uid()
 and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and gm.active=true)
 and exists(select 1 from public.war_events we where we.id=war_event_id and we.is_published=false));
drop policy if exists "Members cancel own war signup" on public.war_signups;
create policy "Members cancel own war signup" on public.war_signups for delete to authenticated
using(member_id=auth.uid() and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and gm.active=true));
