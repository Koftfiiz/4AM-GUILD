# 4AM GUILD Staging Runbook (Free Plan)

## Safety and Egress

- Project: `4AM-GUILD-Staging` (`jmuxbomowtqcigesbimz`), Supabase Free, Singapore.
- Staging and Production share the organization's Free-plan quotas; do not treat Egress as a separate 5 GB allowance per project.
- Staging contains synthetic fixtures only. Never copy Production members, Auth users, Discord credentials, Portfolio data, or Storage objects.
- Do not connect the Staging project to Production Discord webhooks/bot secrets or Production Storage.
- Restore Staging only for a focused migration/QA session, then pause it again. A pause reduces active compute; it does not erase Egress already used.
- Staging currently has one database-only `pg_cron` job (`4am-patch-roster-snapshot`) running once per minute. It calls only `snapshot_due_patch_rosters()`; it makes no HTTP requests and downloads no Storage objects. Verify `cron.job_run_details` during QA, then pause Staging when the work session is complete.
- Use SQL/schema tests and synthetic records before browser QA. Load Portfolio image URLs only when the Workspace Files tab is opened.

## Existing project versus clean rebuild

The current Staging project has already been initialized with synthetic-only schema and fixtures, passed SQL/RLS QA, and is now paused. Do not rerun `guild_affiliation_staging_baseline.sql` against it because it creates base tables and fixture rows without `IF NOT EXISTS`.

For a brand-new blank Free Staging project, use only this canonical sequence:

1. `guild_affiliation_staging_baseline.sql` (synthetic-only guild schema, Auth identities, and member fixtures)
2. `20261119000000_guild_affiliation_foundation.sql`
3. `portfolio_legacy_schema_baseline.sql` (synthetic legacy Portfolio/Patch tables, late-edit permissions/requests, and RLS)
4. `20261119000100_guild_affiliation_directory.sql`
5. `20261119000200_patch_roster_command_center.sql`
6. `20261119_post_qa_baseline_followup.sql` (Staging-only synthetic Discord fixtures and legacy FK parity)
7. `20261119_staging_app_grants_and_rls.sql` (app-compatible authenticated writes, Developer-only Discord account mutation, no anon table access)
8. Run all files in `supabase/tests/` (schema contracts plus transactional workflow regressions).

The other files in `supabase/staging/` are historical incremental QA patches used while developing the prototype. They are not part of the clean rebuild path; do not replay them after the canonical migrations unless a specific schema inspection identifies a missing object.

## Current Staging state

- The project has been paused after successful SQL/RLS QA to conserve Free-plan active resources. Restore it only for the remaining browser QA session.
- The synthetic baseline and three canonical feature migrations have been applied successfully.
- The post-QA fixture/FK follow-up has been applied.
- Both schema contract tests pass.
- Staging grants are aligned to the app's direct-write workflows while preserving RLS; anon has no table privileges on the feature schema.
- One database-only snapshot cron job remains configured at once per minute; it is not running while the project is paused. It makes no HTTP calls and does not touch Storage.
- The current fixtures include synthetic accounts, manual-only/link cases, Patch rounds, roster entries, submissions, and review events. They are not Production data.
- After the remaining Staging QA is complete, pause the Free Staging project to conserve active compute. Do not pause it while a test session is still running.

## Required QA

- Member Directory: account and manual-only rows, filters, bounded pagination, own/history visibility.
- Affiliation: assignment, idempotent same-guild assignment, move history, concurrent update guard, linked-manual canonical identity.
- Patch roster: opening snapshot, 4PM-to-4AM transfer during active Patch, leaving 4AM without deleting snapshot, manual account linking after snapshot.
- Submission: 4AM eligible member, 4PM/unassigned member, late permission, duplicate folder submission, selected version change.
- Review: pending/reviewing/approved/revision-required, required revision note, owner/reviewer-only notes/events.
- Command Center: empty Patch, attention list, member pagination, queue pagination, recent activity, archive/restore.
- Workspace: Discord identity, current affiliation, affiliation history, lazy Portfolio image loading.
- Legacy Portfolio Tracker: selected-round roster counts, only current user's folders for members, bounded roster-member folders for Management, no image URLs in default load, no permanent Patch delete.
- Egress: confirm default pages do not fetch Storage URLs or subscribe to broad Realtime channels; verify list queries return only bounded explicit columns.

## Release rule

Staging validation does not deploy or mutate Production. Production migration files are applied only after all seven phases and acceptance tests are complete. The 4AM/4PM assignments for existing members must be supplied/confirmed by guild Management; never infer them from source tables.


## Preview isolation

- `app.js` and the standalone Duck Race page select Production only for the verified hostname `4am-guild.vercel.app`. Every other hostname, including Vercel Preview URLs and localhost, selects the isolated Staging Supabase project and its publishable key.
- Do not open or share the older Preview deployment built from commit `8993d0e`; it predates the host-routing safeguard and still points to Production.
- The latest feature-branch commit contains the safeguard and passed GitHub Actions. A new Preview build is currently blocked by Vercel's Free daily deployment API quota (100 deployments/24h); no plan upgrade or paid deployment was requested. Retry after the quota window resets.
- No Production deployment was triggered.
