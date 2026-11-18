# Guild Affiliation & Patch Command Center — Development Plan

## Delivery policy

- Build Phases 1–7 on `feature/guild-affiliation-command-center`.
- Do not merge to `main`, deploy the Vercel production site, or enable new production workflows until all phases pass acceptance tests.
- Keep the existing production application and data operational throughout development.
- Production currently contains the initial `guilds` and `guild_member_affiliations` foundation. Its affiliation history is intentionally empty; never infer a member's guild from whether their record is in `guild_members` or `guild_manual_members`.
- Staging project: `jmuxbomowtqcigesbimz` (Supabase Free, Singapore). It has been restored for active QA and contains synthetic fixtures only; no Production member, Portfolio, Storage, Discord, or credential data was copied.

## Identity and affiliation rules

- A registered member is identified canonically by `guild_members.user_id`.
- A manual-only member is identified by `guild_manual_members.id`.
- When a manual record is linked to a registered member, affiliation must be recorded against the canonical `user_id`; do not create a second affiliation for the linked manual row.
- An affiliation change closes the previous active history row and inserts a new row in one transaction.
- No existing member is assigned to 4AM or 4PM until an authorized manager/developer explicitly makes that assignment.
- Keep legacy foreign keys and existing member IDs intact.

## Phases

1. Guild Affiliation: assignment, change history, validation, and authorization.
2. Member Directory: unified directory for registered and manual-only members, search/filter/pagination.
3. Patch Roster: immutable opening snapshot; add eligible members transferred into 4AM during an active Patch without rewriting prior historical snapshots.
4. Command Center Overview: Patch progress, submission state, review state, and attention items.
5. Member Workspace: member profile, affiliation, Discord linkage, portfolio/files, and history.
6. Review Queue and Patch History: reviewer workflow, resubmission, archive, and audit trail.
7. Security, performance, accessibility, responsive QA, and release readiness.

## Egress and Free-plan guardrails

- Never copy production member, portfolio, or image data into Staging.
- Use synthetic records with generated UUIDs and small generated WebP fixtures only when image testing is necessary.
- Do not connect Staging to the production Discord bot, webhooks, or production Storage buckets.
- Select explicit columns; never use `select('*')` for list screens.
- Paginate server-side with bounded page sizes; do not download the complete directory or submission history.
- Cache stable directory/reference data and invalidate only after relevant mutations.
- Subscribe to Realtime only while the relevant screen is active; filter by the smallest relevant scope and always unsubscribe on navigation/logout.
- Avoid polling. Use explicit refresh or narrowly scoped Realtime updates.
- Use thumbnail-sized images in list views and load full-resolution assets only when a user opens the detail view.
- Do not duplicate image objects between environments. Keep Storage testing fixtures small and disposable.
- Record query count, rows returned, payload size where available, and Storage downloads during QA. Treat logs as diagnostic samples, not as exact billing totals.
- Check Free-plan quotas before large test runs. Never upgrade or create paid resources without explicit approval.

## Staging setup and schema parity

The Staging Supabase project now has a reviewed synthetic baseline for the member, affiliation, Portfolio, Patch, and review tables. The canonical feature migrations (`20261119000000`, `20261119000100`, `20261119000200`) have been applied and re-applied successfully. Contract tests and targeted transactional RPC tests pass. Keep Staging isolated: no Production rows, Portfolio images, Storage objects, Discord credentials, or webhooks are copied. A synthetic Auth identity is used only for RLS/RPC tests.

## Release gates

- All seven phases implemented and reviewed on the feature branch.
- Staging schema and migration history are reproducible from the repository.
- No unassigned member is silently classified as 4AM or 4PM.
- Linked manual/registered identities cannot receive duplicate affiliations.
- Existing production workflows and data remain unchanged until release.
- RLS tests cover member, management, leader, and developer access.
- Pagination, cache invalidation, and Realtime lifecycle tests pass.
- Desktop/mobile QA and end-to-end Patch submission/review tests pass.
- A rollback plan is documented before the single production release.


## Free-plan quota clarification

- Production and Staging are in the same Free organization. Egress is an organization-level quota shared across its projects, not a separate 5 GB allowance per project.
- The current Supabase Free documentation lists 5 GB egress for the organization, 1 GB Storage, 500 MB database size per project, and 500,000 Edge Function invocations. Confirm the live usage dashboard before any large test.
- Supabase Free projects may be automatically paused after a week of low activity. Staging must not be kept artificially busy just to avoid pausing; resume it only when active development/testing is needed.
- Pause Staging between work sessions when it is not needed. Pausing reduces active compute time but does not erase egress already consumed in the billing period.
- Prefer local mocked UI/data tests first, then short targeted Staging integration tests. Avoid repeated full-page reloads against Staging and avoid downloading production assets.


## Production affiliation mapping remains a user/Management decision

Latest read-only Production counts: 58 active registered accounts, 14 active Manual-only records, 47 linked Manual records (excluded as duplicates), and 0 current affiliations. The Directory will therefore show 72 distinct active identities as unassigned. No source-table-to-guild assumption is made; each of those 72 identities must be assigned to 4AM or 4PM based on the real guild roster.


## Latest QA and preview safety

- The feature branch now routes the verified Production hostname to Production and all Preview/local hostnames to isolated Staging in both the main app and standalone Duck Race page; this safeguard is covered by the passing JavaScript CI workflow.
- Staging schema contracts and targeted SQL tests cover directory canonical identity/pagination, affiliation privacy and role permissions, immutable Patch roster, late manual-account linking, submission/resubmission history, reviewer-only transitions, and app-compatible table grants.
- Staging's RLS advisor has no multiple-permissive-policy or unindexed-FK warning. Remaining notices are the expected authenticated SECURITY DEFINER helpers/RPCs, inherited leaked-password-protection setting, and unused indexes on the small synthetic dataset.
- Real browser QA is still open. The previous Vercel Preview predates the Staging-routing safeguard; a new Preview build is blocked by the Free daily deployment API quota until its 24-hour window resets. Do not use the old Preview URL.
