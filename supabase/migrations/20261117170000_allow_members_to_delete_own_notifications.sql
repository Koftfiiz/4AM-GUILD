-- Allow each authenticated member to delete only their own notifications.
-- This restores the "Clear all" action without granting cross-member access.
CREATE POLICY "Recipients can delete their own notifications"
ON public.guild_notifications
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = recipient_user_id);
