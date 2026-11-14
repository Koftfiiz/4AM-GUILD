-- Query Name: 4AM_GUILD_FEEDBACK_AND_NOTIFICATIONS_SETUP
-- Type: DDL + Triggers + RLS Policies + Realtime
-- Impact: Creates three new tables and their security policies.
-- Existing guild/member/war/activity data is not modified or deleted.
-- Keep this SQL text in Supabase SQL Editor for future reference.

begin;

create table if not exists public.guild_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('problem','feedback')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  content_html text not null check (char_length(trim(content_html)) between 1 and 20000),
  status text not null default 'received'
    check (status in ('received','in_progress','resolved')),
  updated_by uuid null references auth.users(id) on delete set null,
  discord_notified_at timestamptz null,
  discord_notification_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_feedback_user_created_idx
  on public.guild_feedback(user_id, created_at desc);
create index if not exists guild_feedback_status_created_idx
  on public.guild_feedback(status, created_at desc);
create index if not exists guild_feedback_type_created_idx
  on public.guild_feedback(type, created_at desc);

create table if not exists public.guild_feedback_status_history (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.guild_feedback(id) on delete cascade,
  changed_by uuid null references public.guild_members(user_id) on delete set null,
  from_status text null check (from_status is null or from_status in ('received','in_progress','resolved')),
  to_status text not null check (to_status in ('received','in_progress','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists guild_feedback_history_ticket_idx
  on public.guild_feedback_status_history(feedback_id, created_at asc);

create table if not exists public.guild_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  feedback_id uuid not null references public.guild_feedback(id) on delete cascade,
  notification_type text not null check (notification_type in ('new_feedback','status_changed')),
  title text not null,
  body text not null,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists guild_notifications_recipient_created_idx
  on public.guild_notifications(recipient_user_id, created_at desc);
create index if not exists guild_notifications_unread_idx
  on public.guild_notifications(recipient_user_id, is_read, created_at desc);

alter table public.guild_feedback enable row level security;
alter table public.guild_feedback_status_history enable row level security;
alter table public.guild_notifications enable row level security;

-- Explicit client privileges; row-level policies below enforce per-user access.
grant select, insert, update on public.guild_feedback to authenticated;
grant select on public.guild_feedback_status_history to authenticated;
grant select, insert, update, delete on public.guild_notifications to authenticated;


drop policy if exists "Guild feedback owner and management can read" on public.guild_feedback;
create policy "Guild feedback owner and management can read"
on public.guild_feedback for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.is_war_manager()
    and exists (
      select 1 from public.guild_members gm
      where gm.user_id = auth.uid() and gm.active = true
    )
  )
);

drop policy if exists "Active guild members can submit feedback" on public.guild_feedback;
create policy "Active guild members can submit feedback"
on public.guild_feedback for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  )
);

drop policy if exists "Only management can update feedback status" on public.guild_feedback;
create policy "Only management can update feedback status"
on public.guild_feedback for update to authenticated
using (
  public.is_war_manager()
  and exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  )
)
with check (
  public.is_war_manager()
  and exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  )
);

drop policy if exists "Feedback owner and management can read status history" on public.guild_feedback_status_history;
create policy "Feedback owner and management can read status history"
on public.guild_feedback_status_history for select to authenticated
using (
  public.is_war_manager()
  or exists (
    select 1 from public.guild_feedback f
    where f.id = feedback_id and f.user_id = auth.uid()
  )
);

drop policy if exists "Recipients can read their notifications" on public.guild_notifications;
create policy "Recipients can read their notifications"
on public.guild_notifications for select to authenticated
using (recipient_user_id = auth.uid());

drop policy if exists "Recipients can update their notification read state" on public.guild_notifications;
create policy "Recipients can update their notification read state"
on public.guild_notifications for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

-- Members may permanently delete only their own notification history.
drop policy if exists "Recipients can delete their own notifications" on public.guild_notifications;
create policy "Recipients can delete their own notifications"
on public.guild_notifications for delete to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.guard_guild_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  ) then
    raise exception 'Active guild membership required';
  end if;

  new.user_id := auth.uid();
  new.status := 'received';
  new.updated_by := null;
  new.discord_notified_at := null;
  new.discord_notification_error := null;
  new.updated_at := coalesce(new.created_at, now());
  return new;
end;
$$;

create or replace function public.guard_guild_feedback_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.content_html is distinct from old.content_html
    or new.created_at is distinct from old.created_at then
    raise exception 'Feedback content and owner are immutable after submission';
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.discord_notified_at is distinct from old.discord_notified_at
    or new.discord_notification_error is distinct from old.discord_notification_error then
    raise exception 'Only the notification service can update Discord delivery fields';
  end if;

  if new.status is distinct from old.status then
    if not public.is_war_manager() then
      raise exception 'Only Developer, Leader, or Management can change feedback status';
    end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

create or replace function public.record_guild_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_member_name text;
begin
  select coalesce(nullif(gm.character_name,''), nullif(gm.nickname,''), nullif(gm.discord_name,''), 'สมาชิก 4AM')
  into v_member_name
  from public.guild_members gm
  where gm.user_id = new.user_id;

  insert into public.guild_feedback_status_history(feedback_id, changed_by, from_status, to_status)
  values (new.id, new.user_id, null, new.status);

  insert into public.guild_notifications(recipient_user_id, feedback_id, notification_type, title, body)
  select gm.user_id, new.id, 'new_feedback',
    case when new.type = 'problem' then 'มีการแจ้งปัญหาใหม่' else 'มี Feedback ใหม่' end,
    v_member_name || ' ส่ง' ||
      case when new.type = 'problem' then 'ปัญหา: ' else 'Feedback: ' end ||
      left(new.title, 180)
  from public.guild_members gm
  where gm.active = true
    and lower(coalesce(gm.role,'')) in ('developer','leader','management');

  return new;
end;
$$;

create or replace function public.record_guild_feedback_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status is distinct from old.status then
    insert into public.guild_feedback_status_history(feedback_id, changed_by, from_status, to_status)
    values (new.id, auth.uid(), old.status, new.status);

    insert into public.guild_notifications(recipient_user_id, feedback_id, notification_type, title, body)
    values (
      new.user_id,
      new.id,
      'status_changed',
      'สถานะรายการของคุณมีการอัปเดต',
      '“' || left(new.title, 160) || '” เปลี่ยนสถานะเป็น ' ||
        case new.status
          when 'received' then 'รับเรื่องแล้ว'
          when 'in_progress' then 'กำลังดำเนินการ'
          when 'resolved' then 'แก้ไขแล้ว'
        end
    );
  end if;
  return new;
end;
$$;

create or replace function public.guard_guild_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.recipient_user_id is distinct from old.recipient_user_id
    or new.feedback_id is distinct from old.feedback_id
    or new.notification_type is distinct from old.notification_type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at then
    raise exception 'Notification content is immutable';
  end if;

  if new.is_read is distinct from old.is_read and new.is_read = false then
    raise exception 'Notifications cannot be marked unread';
  end if;
  if new.is_read = true then
    new.read_at := coalesce(new.read_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_guild_feedback_insert on public.guild_feedback;
create trigger trg_guard_guild_feedback_insert
before insert on public.guild_feedback
for each row execute function public.guard_guild_feedback_insert();

drop trigger if exists trg_guard_guild_feedback_update on public.guild_feedback;
create trigger trg_guard_guild_feedback_update
before update on public.guild_feedback
for each row execute function public.guard_guild_feedback_update();

drop trigger if exists trg_record_guild_feedback_insert on public.guild_feedback;
create trigger trg_record_guild_feedback_insert
after insert on public.guild_feedback
for each row execute function public.record_guild_feedback_insert();

drop trigger if exists trg_record_guild_feedback_status_change on public.guild_feedback;
create trigger trg_record_guild_feedback_status_change
after update on public.guild_feedback
for each row execute function public.record_guild_feedback_status_change();

drop trigger if exists trg_guard_guild_notification_update on public.guild_notifications;
create trigger trg_guard_guild_notification_update
before update on public.guild_notifications
for each row execute function public.guard_guild_notification_update();

-- Add the three tables to Supabase Realtime without duplicating existing publication entries.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['guild_feedback','guild_feedback_status_history','guild_notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
