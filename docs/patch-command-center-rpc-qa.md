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
