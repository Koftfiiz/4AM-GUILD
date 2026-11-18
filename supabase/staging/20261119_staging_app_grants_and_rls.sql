-- Staging-only: mirror the app's authenticated write surface while keeping
-- anonymous access disabled. RLS policies below remain the row-level boundary.
-- Patch submissions/reviews/rosters/events are read-only; writes use guarded RPCs.

begin;

-- Match the Production role boundaries without copying its broad anon grants.
drop policy if exists "Admins can manage members" on public.guild_members;
create policy "Admins can manage members" on public.guild_members
 for all to authenticated using(public.can_manage_guild_affiliations())
 with check(public.can_manage_guild_affiliations());
drop policy if exists "Members can update own profile" on public.guild_members;
create policy "Members can update own profile" on public.guild_members
 for update to authenticated
 using(user_id=(select auth.uid()) and active=true)
 with check(user_id=(select auth.uid()) and active=true);
drop policy if exists "Users can view own membership record" on public.guild_members;
create policy "Users can view own membership record" on public.guild_members
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists guild_members_read_directory on public.guild_members;
create policy guild_members_read_directory on public.guild_members
 for select to authenticated using(active=true or public.can_manage_guild_affiliations());

drop policy if exists "Guild admins can manage manual members" on public.guild_manual_members;
create policy "Guild admins can manage manual members" on public.guild_manual_members
 for all to authenticated using(public.can_manage_guild_affiliations())
 with check(public.can_manage_guild_affiliations());
drop policy if exists guild_manual_members_read_directory on public.guild_manual_members;
create policy guild_manual_members_read_directory on public.guild_manual_members
 for select to authenticated using(active=true or public.can_manage_guild_affiliations());

drop policy if exists "Developer can manage Discord accounts" on public.discord_accounts;
create policy "Developer can manage Discord accounts" on public.discord_accounts
 for all to authenticated
 using(exists(select 1 from public.guild_members gm
   where gm.user_id=(select auth.uid()) and gm.active=true
    and gm.membership_status='active' and gm.role='developer'))
 with check(exists(select 1 from public.guild_members gm
   where gm.user_id=(select auth.uid()) and gm.active=true
    and gm.membership_status='active' and gm.role='developer'));
drop policy if exists discord_accounts_read_owner_or_management on public.discord_accounts;
create policy discord_accounts_read_owner_or_management on public.discord_accounts
 for select to authenticated using(
  user_id=(select auth.uid()) or public.can_manage_guild_affiliations()
 );

drop policy if exists "Guild admins can manage member affiliations" on public.guild_member_affiliations;
create policy "Guild admins can manage member affiliations" on public.guild_member_affiliations
 for all to authenticated using(public.can_manage_guild_affiliations())
 with check(public.can_manage_guild_affiliations());

drop policy if exists "Guild admins can manage guilds" on public.guilds;
create policy "Guild admins can manage guilds" on public.guilds
 for all to authenticated using(public.can_manage_guild_affiliations())
 with check(public.can_manage_guild_affiliations());

revoke all on public.guilds,public.guild_members,public.guild_manual_members,
 public.discord_accounts,public.guild_member_affiliations,
 public.portfolio_update_rounds,public.portfolio_update_edit_permissions,
 public.portfolio_update_edit_requests,public.portfolios,public.portfolio_versions,
 public.portfolio_version_images,public.portfolio_patch_submissions,
 public.portfolio_patch_roster,public.portfolio_patch_submission_reviews,
 public.portfolio_patch_review_events,public.portfolio_patch_submission_events
from public,anon,authenticated;

grant select,insert,update,delete on public.guilds,public.guild_members,
 public.guild_manual_members,public.discord_accounts,public.guild_member_affiliations,
 public.portfolio_update_rounds,public.portfolio_update_edit_permissions,
 public.portfolio_update_edit_requests,public.portfolios,public.portfolio_version_images
to authenticated;
grant select,insert,delete on public.portfolio_versions to authenticated;
grant select on public.portfolio_patch_submissions,public.portfolio_patch_roster,
 public.portfolio_patch_submission_reviews,public.portfolio_patch_review_events,
 public.portfolio_patch_submission_events to authenticated;

commit;
