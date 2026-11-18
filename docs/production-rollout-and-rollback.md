# 4AM GUILD — Production Rollout and Rollback Plan

## Release status

This document is a release checklist, not an authorization to deploy. The feature branch is not merged to `main`, the Production database has not been changed by these Phase 1–7 migrations, and no Production deployment has been triggered.

## Pre-release facts verified

- Production already has `guilds` and `guild_member_affiliations`; the affiliation table currently has **0 rows**.
- Production already has `portfolio_update_rounds` and `portfolio_patch_submissions`; the latest inspected counts were **0 rounds** and **0 submissions**.
- Production has existing Portfolio folders and Versions. The migration does not recreate or replace those tables.
- Production already has `pg_cron` 1.6.4 and two active jobs. The new migration adds a separate `4am-patch-roster-snapshot` job and does not edit the existing Guild War jobs.
- The Production project has not received the Staging synthetic fixtures, Auth users, image placeholders, or test records.

Recheck all counts and the cron job list immediately before applying migrations; the values above are inventory snapshots, not permanent assumptions.

## Production migration order

Apply only these files, in this order, using the Production Supabase SQL editor:

1. `supabase/migrations/20261119000000_guild_affiliation_foundation.sql`
2. `supabase/migrations/20261119000100_guild_affiliation_directory.sql`
3. `supabase/migrations/20261119000200_patch_roster_command_center.sql`

Do **not** apply any file under `supabase/staging/` to Production. The synthetic legacy baseline is for Staging only.

Each canonical migration is transactional and additive. The Patch migration uses the existing Production Portfolio/Patch tables; it does not drop or recreate them. The new Patch roster, review, and submission-event tables start empty. The initial submission-event backfill only copies existing submission metadata; it does not copy images or Storage objects.

## Pre-deploy checks

- Confirm Production affiliation rows are still zero, or review the actual rows and preserve them.
- Confirm the existing `portfolio_patch_submissions` schema, unique constraint, FKs, grants, RLS, and triggers still match the inspected contract.
- Confirm the existing `portfolio_update_rounds`, `portfolio_versions`, `portfolio_version_images`, and late-edit permission/request tables still match the inspected contract.
- Confirm `pg_cron` is installed and the existing two Guild War jobs are active.
- Confirm the feature branch's latest GitHub Actions validation is green.
- Confirm the Staging contract tests and authorization/workflow regressions are green.
- Confirm no unassigned member has been silently mapped to 4AM or 4PM.

## Single-release sequence

1. Pause manual Production changes to Guild membership, Portfolio Patch rounds, and late-edit permissions for the short maintenance window.
2. Take a free-tier-available export/backup of the affected tables and record the current cron jobs and RLS policies. Do not assume paid point-in-time recovery is enabled.
3. Apply the three canonical migrations in order.
4. Verify the 4AM/4PM guild rows, affiliation indexes/policies, new Patch tables, audit triggers, FK indexes, and the new cron job.
5. Run read-only Production smoke checks for the RPC signatures and table counts. Do not create real affiliation assignments as a test.
6. Merge the reviewed feature PR to `main`. Let the existing Vercel Git integration perform its normal Production deployment; do not trigger repeated manual deployments.
7. Verify the Production deployment is Ready, the Guild Directory and Command Center routes load for the correct roles, and existing Dashboard, Guild War, Portfolio, Discord, and member workflows still work.
8. Keep the 4AM/4PM affiliation table empty until Management supplies the real member-to-guild mapping. Then assign members through the Directory UI in a separate controlled operation.

## Rollback

The database rollout is additive. If the frontend deployment fails:

1. Revert the feature merge or roll Vercel back to the previous Production deployment.
2. Disable only the new cron job:
   `select cron.unschedule(jobid) from cron.job where jobname='4am-patch-roster-snapshot';`
3. Leave the new tables, indexes, and audit data in place. Do not drop them or delete affiliation/roster history as a rollback shortcut.
4. Keep existing Guild War cron jobs untouched.
5. Reconcile the app version and database state before attempting another release.

If the new role boundary must be reverted, restore the original Production policies exactly as captured before migration:

- `Guild admins can manage guilds` — `FOR ALL`, `USING (is_guild_admin())`, `WITH CHECK (is_guild_admin())`.
- `Guild admins can manage member affiliations` — `FOR ALL`, `USING (is_guild_admin())`, `WITH CHECK (is_guild_admin())`.
- `Members can view own guild affiliation` — restore the pre-release predicate: own `user_id`, linked Manual row for the current user, or `is_guild_admin()`; remove the added current-directory branch.
- `portfolio update rounds managed by management` — `FOR ALL`, `USING (is_portfolio_management())`, `WITH CHECK (is_portfolio_management())`.
- `portfolio update permissions managed by management` — `FOR ALL`, `USING (is_portfolio_management())`, `WITH CHECK (is_portfolio_management())`.

Do not run this policy rollback unless the product decision is to restore the previous broader authorization model. The new model intentionally excludes HR/Admin-only accounts from affiliation management.

## Free-plan and Egress controls

- No new Storage bucket, object copy, image migration, external HTTP worker, or Discord webhook is introduced by these migrations.
- The Patch snapshot cron job is database-only and runs once per minute; it does not call HTTP endpoints or download Storage files.
- Directory and Command Center reads are bounded and use explicit columns/server-side aggregation.
- Workspace loads Portfolio images only after a reviewer opens Files, with a maximum of 100 image metadata rows per request and lazy-loaded thumbnails.
- Keep Staging paused when no active QA session is needed. Do not repeatedly download Production Portfolio images for testing.
