-- Staging-only RLS tightening for immutable Patch roster reads.
drop policy if exists patch_roster_read on public.portfolio_patch_roster;
create policy patch_roster_read
on public.portfolio_patch_roster for select to authenticated
using (public.is_guild_member());
