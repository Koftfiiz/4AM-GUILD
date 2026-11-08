-- Query Name: 4AM_GUILD_WAR_RECORD_EDIT_DELETE_POLICIES
-- Type: RLS Policies + Storage Policy
-- Impact: Allows Developer, Leader and Management to edit/delete war records
-- and remove their evidence images. Existing records and images are not changed.
-- Requires public.is_war_manager() and the war-record-images bucket.

drop policy if exists "War managers can update match records" on public.war_match_records;
create policy "War managers can update match records"
on public.war_match_records
for update to authenticated
using (public.is_war_manager())
with check (public.is_war_manager());

drop policy if exists "War managers can delete match records" on public.war_match_records;
create policy "War managers can delete match records"
on public.war_match_records
for delete to authenticated
using (public.is_war_manager());

drop policy if exists "War managers can delete war record evidence" on storage.objects;
create policy "War managers can delete war record evidence"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'war-record-images'
  and public.is_war_manager()
);
