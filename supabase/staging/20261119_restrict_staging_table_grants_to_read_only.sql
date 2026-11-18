-- Staging-only: all API tables are read-only for authenticated clients.
-- Mutations must pass through the narrowly scoped SECURITY DEFINER RPCs/triggers.
revoke all on public.guilds,public.guild_members,public.guild_manual_members,
 public.guild_member_affiliations,public.portfolio_update_rounds,public.portfolio_patch_roster,
 public.portfolios,public.portfolio_versions,public.portfolio_version_images,
 public.portfolio_patch_submissions,public.portfolio_patch_submission_reviews,
 public.portfolio_patch_review_events from public,anon,authenticated;
grant select on public.guilds,public.guild_members,public.guild_manual_members,
 public.guild_member_affiliations,public.portfolio_update_rounds,public.portfolio_patch_roster,
 public.portfolios,public.portfolio_versions,public.portfolio_version_images,
 public.portfolio_patch_submissions,public.portfolio_patch_submission_reviews,
 public.portfolio_patch_review_events to authenticated;
