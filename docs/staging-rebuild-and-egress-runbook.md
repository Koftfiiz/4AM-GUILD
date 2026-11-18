# 4AM GUILD Staging Runbook (Free Plan)

## Safety and Egress

- Project: `4AM-GUILD-Staging` (`jmuxbomowtqcigesbimz`), Supabase Free, Singapore.
- Staging and Production share the organization's Free-plan quotas; do not treat Egress as a separate 5 GB allowance per project.
- Staging contains synthetic fixtures only. Never copy Production members, Auth users, Discord credentials, Portfolio data, or Storage objects.
- Do not connect the Staging project to Production Discord webhooks/bot secrets or Production Storage.
- Restore Staging only for a focused migration/QA session, then pause it again. A pause reduces active compute; it does not erase Egress already used.
- No scheduled cron job is installed on Staging. The Production migration's one-minute snapshot worker is intentionally excluded from Staging.
- Use SQL/schema tests and synthetic records before browser QA. Load Portfolio image URLs only when the Workspace Files tab is opened.

## Existing project versus clean rebuild

The initial synthetic baseline has already been applied to the current Staging project. Do not rerun `guild_affiliation_staging_baseline.sql` against that project because it creates base tables and fixtures without `IF NOT EXISTS`.

For a new blank Free Staging project, use this order:

1. `guild_affiliation_staging_baseline.sql`
2. `20261119_tighten_affiliation_rpc_permissions_and_idempotency.sql`
3. `20261119_server_side_member_directory_rpc.sql`
4. `20261119_patch_roster_snapshot_and_affiliation_sync.sql`
5. `20261119_align_patch_permissions_with_portfolio_roles.sql`
6. `20261119_secure_patch_round_management_rpcs.sql`
7. `20261119_merge_manual_affiliation_on_account_link.sql`
8. `20261119_patch_command_center_submission_review_foundation.sql`
9. `20261119_post_qa_baseline_followup.sql`
10. `20261119_make_patch_snapshot_due_independent_of_round_status.sql`
11. `20261119_patch_member_partial_submission_status.sql`
12. `20261119_guard_member_directory_rpc_and_bound_pagination.sql`
13. `20261119_index_patch_command_center_foreign_keys.sql`
14. `20261119_restrict_staging_table_grants_to_read_only.sql`

Re-run the schema contract tests after the complete sequence.

## Current paused project's post-QA update

For the already-initialized Staging project, first inspect applied migrations, tables, constraints, and policies. Apply only the additive follow-up migration and re-apply the idempotent `CREATE OR REPLACE`/policy migrations needed to match the current feature branch. Do not re-run the base schema file. Re-apply in this order:

1. `20261119_post_qa_baseline_followup.sql`
2. `20261119_patch_roster_snapshot_and_affiliation_sync.sql`
3. `20261119_align_patch_permissions_with_portfolio_roles.sql`
4. `20261119_secure_patch_round_management_rpcs.sql`
5. `20261119_merge_manual_affiliation_on_account_link.sql`
6. `20261119_patch_command_center_submission_review_foundation.sql`
7. `20261119_make_patch_snapshot_due_independent_of_round_status.sql`
8. `20261119_patch_member_partial_submission_status.sql`
9. `20261119_guard_member_directory_rpc_and_bound_pagination.sql`
10. `20261119_index_patch_command_center_foreign_keys.sql`
11. `20261119_restrict_staging_table_grants_to_read_only.sql`

If any listed migration is absent from the Staging migration history, inspect the actual schema before applying it. Do not blindly replay non-idempotent SQL.

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
