# Patch Command Center RPC QA — 2026-11-19

## Read model

Added `get_patch_command_center` on Staging as a bounded, management-only, `SECURITY INVOKER` RPC.

It returns:
- Up to 12 Patch rounds for the selector/archive view.
- Selected Patch metadata.
- Aggregate roster/submission/review counts.
- One bounded page of roster members.
- One bounded page of review queue items.
- Up to 10 recent review events.

The read model uses explicit columns and aggregates in PostgreSQL; the browser does not download all Portfolios, Versions, or review history.

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

- Complete the full Staging schema contract for legacy app tables used by nested Portfolio queries and existing RLS policies.
- Verify the new pages in a browser session with real authenticated Staging users (not synthetic JWT claims).
- Complete responsive/accessibility checks and regression tests against the legacy Portfolio Tracker.
- Prepare Production migrations and a rollback plan; do not merge/deploy until all seven phases pass.


## Follow-up hardening after initial QA

- Staging role helpers now require `active = true` and `membership_status = 'active'`, with the project owner's explicit Developer allowlist preserved.
- Patch read policies now scope review notes/events to the submission owner or an authorized reviewer; general Patch data is restricted to active guild members.
- Staging submission FK delete behavior has been aligned with the inspected Production constraints (member cascade, portfolio restrict, round cascade, version restrict).
- These follow-up SQL edits are committed on the feature branch but have not yet been re-applied/re-tested because the Free Staging project has been paused to conserve active resources. Re-run the targeted QA suite after resuming Staging.


## Review queue pagination follow-up

The read RPC now exposes `review_queue_total`, and the Command Center UI includes Previous/Next controls using the same bounded page size as the member list. This follow-up change is committed but not yet re-applied/re-tested on Staging.
