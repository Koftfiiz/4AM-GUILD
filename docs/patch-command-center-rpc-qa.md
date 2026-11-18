# Patch Command Center RPC QA — 2026-11-19

## Read model

Added `get_patch_command_center` on Staging as a bounded, management-only, `SECURITY INVOKER` RPC.

It returns:
- Up to 50 Patch rounds for the selector/archive view.
- Selected Patch metadata.
- Aggregate roster/submission/review counts.
- One bounded page of roster members.
- One bounded page of review queue items.
- Up to 10 recent review events.

The read model uses explicit columns and aggregates in PostgreSQL; the browser does not download all Portfolios, Versions, or review history. Recent Activity includes both review transitions and first/resubmitted Patch Versions.

## Role alignment

The Production application already defines `is_portfolio_management()` and `is_portfolio_reviewer()`. Staging was aligned to these exact role sets:
- Management/Command Center access: Developer, Leader, Management.
- Review access: Developer, Leader, Management.
- HR/Admin role alone is not granted these new controls.
- Role Preview is blocked in the browser UI and does not grant server-side access.

## QA

- A synthetic Management account retrieved the dashboard, roster count, and review queue.
- A normal Member account was rejected with `Management access required`.
- A temporary second Portfolio folder made a member's aggregate status `partial`; the partial filter returned that member and the Review Queue correctly returned no row for the partial-only filter.
- Review and affiliation mutation RPCs use the same Production role helpers rather than the broader generic admin role.
- All temporary QA changes were rolled back.

## UI integration on feature branch

- `guild-affiliation-directory.js` adds a paginated Guild Directory page using the server-side directory RPC.
- `patch-command-center.js` adds the Management-only Patch Submission Command Center, Member Workspace, Review Queue, Patch History, review actions, and Patch lifecycle controls.
- `index.html` loads the new scripts after the existing app and Portfolio Tracker scripts.
- JavaScript syntax checks passed.
- No production deployment or production data modification was performed.

## Remaining integration gates

- Verify the new pages in a browser session with real authenticated Staging users (not synthetic JWT claims).
- Complete responsive/accessibility checks and regression tests against the legacy Portfolio Tracker.
- Prepare Production migrations and a rollback plan; do not merge/deploy until all seven phases pass.


## Follow-up hardening after initial QA

- Staging role helpers now require `active = true` and `membership_status = 'active'`, with the project owner's explicit Developer allowlist preserved.
- Patch read policies now scope review notes/events to the submission owner or an authorized reviewer; general Patch data is restricted to active guild members.
- Staging submission FK delete behavior has been aligned with the inspected Production constraints (member cascade, portfolio restrict, round cascade, version restrict).
- These follow-up SQL edits have been applied to Staging and verified through the schema contract tests and targeted role/RPC checks.


## Review queue pagination follow-up

The read RPC now exposes `review_queue_total`, and the Command Center UI includes Previous/Next controls using the same bounded page size as the member list. This follow-up change has been applied to Staging and the queue totals and bounded paging inputs were checked.


## Latest review fixes revalidated in Staging

- Review Queue now has bounded Previous/Next pagination and a server-provided total count.
- The Command Center RPC returns a valid empty-state payload when a Patch has no roster rows.
- Pagination ordering includes stable tie-breakers to avoid duplicate/skipped rows between pages.
- Review notes and audit events are visible only to the submission owner or authorized Developer/Leader/Management reviewers.
- Creating an already-started Patch or closing/archiving a due Patch first snapshots its roster, preventing lifecycle timing races.
- These changes have been re-applied to Staging and passed the schema contract and targeted workflow tests.


## Member Workspace follow-up

The feature branch now loads Discord account identity/verification and the member's affiliation history only when Management opens a Workspace. The Workspace History tab combines affiliation history with Patch review events. Requests are bounded (50 affiliation rows, 30 folders/submissions) and do not run during the normal directory/dashboard load. These UI additions await Staging browser validation.


The legacy member-facing Portfolio Tracker has also been aligned with the 4AM roster: progress totals use the selected Patch snapshot, out-of-roster accounts are not offered submission actions after the snapshot is ready, and the delete-round action is removed in favor of archive/restore. The submission RPC performs a due snapshot before roster validation. Pending Staging QA.


Latest GitHub Actions validation: JavaScript syntax checks passed on the feature branch after the Workspace, pagination, and Portfolio Tracker updates. The workflow also enforces the 15px minimum and black/red theme; the newest workflow run for the follow-up SQL/docs commit is queued separately.


The Member Workspace now loads Portfolio folders and Version metadata in separate bounded queries (30 folders, 100 Versions), review and submission history are each capped at 50 events, and image metadata (maximum 100) is fetched only when Files is opened. Thumbnails are lazy-loaded; Overview and Directory do not request Storage URLs or download image content. Opening a member's Portfolio from Workspace preserves Management mode.


## Latest database performance and policy review

- Duplicate permissive SELECT policies on the Guild, affiliation, Patch roster, legacy Portfolio, and late-edit tables were consolidated or removed. The Staging performance advisor no longer reports multiple permissive policies.
- Indexes now cover the new submission audit Version/actor foreign keys and the existing late-edit permission/request and Portfolio Version creator foreign keys.
- The advisor still reports unused indexes on the tiny synthetic Staging dataset. These indexes support real member counts, Patch lookups, history, and FK maintenance in Production; do not remove them based on the small fixture.
- The security advisor's authenticated SECURITY DEFINER notices are intentional for the guarded RPCs and caller-specific authorization helpers. The internal snapshot/audit trigger functions are not executable by anon/authenticated. Leaked-password protection is a separate inherited Staging Auth setting.


## Latest Staging regression pass

- Both Guild Affiliation and Patch Command Center schema contract SQL tests pass against the active Free Staging project.
- GitHub Actions run #150 passed on feature-branch head `5744edb`; JavaScript syntax, 15px typography, and black/red theme checks are green.
- Targeted SQL regression tests passed for empty Patch state, bounded non-overlapping Review Queue pagination, immutable opening roster after a member leaves 4AM, 4PM/non-roster submission rejection, cross-owner Portfolio submission rejection, Version resubmission audit, and review reset to pending.
- Manual-only 4AM affiliation was merged into the canonical account on account linking and inserted into the already-open Patch roster once; the test was rolled back.
- Management cannot mutate Developer-only Discord account rows. Anonymous table privileges are revoked across the Staging feature schema; authenticated writes follow the same RLS-protected app workflows as Production.
- The security advisor reports only expected authenticated SECURITY DEFINER helper/RPC notices plus the inherited Staging leaked-password-protection setting. The performance advisor reports unused indexes on the small synthetic fixture; no multiple-permissive-policy or unindexed-FK warning remains.
- No Production data, schema, secrets, or deployment were changed.

Browser validation with a real Staging login, responsive/accessibility checks, and the final legacy Portfolio Tracker regression remain open gates before merge/deploy.


The Review Queue is also exposed as its own Management-only sidebar entry. It opens the same Command Center data context directly on the queue view, avoiding a duplicate page or duplicate data loader.
