-- Discord Embed Studio: message registry, templates, and audit history.
create table if not exists public.discord_embed_messages (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  record_id text not null,
  message_type text not null default 'primary',
  channel_id text not null,
  message_id text not null,
  source text not null default 'legacy_link',
  last_payload jsonb,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_embed_messages_event_record_type_key unique(event_key, record_id, message_type),
  constraint discord_embed_messages_channel_message_key unique(channel_id, message_id)
);

create table if not exists public.discord_embed_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  template_name text not null default 'Default',
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_embed_templates_event_version_key unique(event_key, version)
);

create table if not exists public.discord_embed_history (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  record_id text,
  message_type text not null default 'primary',
  channel_id text,
  message_id text,
  action text not null,
  before_payload jsonb,
  after_payload jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists discord_embed_messages_event_record_idx
  on public.discord_embed_messages(event_key, record_id);
create index if not exists discord_embed_history_event_created_idx
  on public.discord_embed_history(event_key, created_at desc);
create index if not exists discord_embed_templates_event_active_idx
  on public.discord_embed_templates(event_key, is_active, version desc);

alter table public.discord_embed_messages enable row level security;
alter table public.discord_embed_templates enable row level security;
alter table public.discord_embed_history enable row level security;

drop policy if exists "Active management can view Discord embed messages" on public.discord_embed_messages;
create policy "Active management can view Discord embed messages"
on public.discord_embed_messages for select to authenticated
using (exists (
  select 1 from public.guild_members gm
  where gm.user_id = auth.uid() and gm.active = true
    and gm.role in ('developer','leader','management')
));

drop policy if exists "Active management can view Discord embed templates" on public.discord_embed_templates;
create policy "Active management can view Discord embed templates"
on public.discord_embed_templates for select to authenticated
using (exists (
  select 1 from public.guild_members gm
  where gm.user_id = auth.uid() and gm.active = true
    and gm.role in ('developer','leader','management')
));

drop policy if exists "Active management can view Discord embed history" on public.discord_embed_history;
create policy "Active management can view Discord embed history"
on public.discord_embed_history for select to authenticated
using (exists (
  select 1 from public.guild_members gm
  where gm.user_id = auth.uid() and gm.active = true
    and gm.role in ('developer','leader','management')
));

grant select on public.discord_embed_messages, public.discord_embed_templates, public.discord_embed_history to authenticated;
grant all on public.discord_embed_messages, public.discord_embed_templates, public.discord_embed_history to service_role;
