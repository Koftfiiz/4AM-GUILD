# Guild Affiliation & Patch Command Center — Development Plan

## Delivery policy

- Build Phases 1–7 on `feature/guild-affiliation-command-center`.
- Do not merge to `main`, deploy the Vercel production site, or enable new production workflows until all phases pass acceptance tests.
- Keep the existing production application and data operational throughout development.
- Production currently contains the initial `guilds` and `guild_member_affiliations` foundation. Its affiliation history is intentionally empty; never infer a member's guild from whether their record is in `guild_members` or `guild_manual_members`.
- Staging project: `jmuxbomowtqcigesbimz` (Supabase Free, Singapore). It is a blank project and must use synthetic test data only.

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

The Staging Supabase project is currently blank. Do not apply feature migrations until a reproducible schema baseline for the existing application has been prepared and reviewed. The repository currently contains only a subset of the migrations recorded by Production, so blindly replaying the checked-in migrations is not a valid way to create a working Staging database.

Create a schema-only baseline from reviewed DDL (no production rows, Auth users, Storage objects, secrets, or Discord credentials), then apply feature migrations in order. Verify RLS, functions, triggers, and constraints before using Staging for workflow tests.

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
