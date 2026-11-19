-- Staging-only compatibility patch for the unified Member Management Center.
-- Adds fields already consumed by the existing management UI and restores
-- website presence storage with owner/management-scoped RLS.

alter table public.guild_members
  add column if not exists game_uid text,
  add column if not exists guild_position text;

alter table public.guild_manual_members
  add column if not exists game_uid text,
  add column if not exists guild_position text,
  add column if not exists discord_user_id text,
  add column if not exists discord_username text,
  add column if not exists discord_global_name text,
  add column if not exists discord_server_nickname text,
  add column if not exists discord_avatar_url text;

alter table public.discord_accounts
  add column if not exists discord_connection_status text not null default 'unknown';

create or replace function public.guard_guild_member_admin_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.can_manage_guild_affiliations()
     and new.guild_position is distinct from old.guild_position then
    raise exception 'Only guild management can change guild position';
  end if;
  return new;
end;
$$;

drop trigger if exists guild_members_guard_admin_fields on public.guild_members;
create trigger guild_members_guard_admin_fields
before update of guild_position on public.guild_members
for each row execute function public.guard_guild_member_admin_fields();

create table if not exists public.guild_member_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists guild_member_presence_last_seen_idx
  on public.guild_member_presence(last_seen_at desc);

alter table public.guild_member_presence enable row level security;

drop policy if exists guild_member_presence_read_self_or_management on public.guild_member_presence;
create policy guild_member_presence_read_self_or_management
on public.guild_member_presence for select to authenticated
using (user_id = (select auth.uid()) or public.can_manage_guild_affiliations());

drop policy if exists guild_member_presence_insert_self on public.guild_member_presence;
create policy guild_member_presence_insert_self
on public.guild_member_presence for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists guild_member_presence_update_self on public.guild_member_presence;
create policy guild_member_presence_update_self
on public.guild_member_presence for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists guild_member_presence_delete_self on public.guild_member_presence;
create policy guild_member_presence_delete_self
on public.guild_member_presence for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.guild_member_presence to authenticated;
