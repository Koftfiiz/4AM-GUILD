-- Query Name: 4AM_GUILD_FIX_NOTIFICATION_DELETE_RLS
-- Purpose: Allow each authenticated member to permanently clear only their own notification history.
-- Safe to run more than once.

begin;

grant delete on table public.guild_notifications to authenticated;

drop policy if exists "Recipients can delete their own notifications"
on public.guild_notifications;

create policy "Recipients can delete their own notifications"
on public.guild_notifications
for delete
to authenticated
using (recipient_user_id = auth.uid());

commit;
