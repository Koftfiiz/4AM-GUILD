# Patch Roster & Command Center Staging QA — 2026-11-19

## Staging scope

All tables and records below exist only in `4AM-GUILD-Staging`. They are synthetic fixtures; no Production member rows, Portfolio rows, Storage objects, Auth users, Discord credentials, or webhooks were copied.

## Implemented Staging data model

- `portfolio_update_rounds.roster_snapshot_at`: marks that the opening snapshot has been created.
- `portfolio_patch_roster`: immutable member snapshot per Patch, including display-name/Class snapshots and source (`opening_snapshot`, `affiliation_transfer`, or `manual_link`).
- `portfolio_patch_submissions`: one selected Version per Portfolio folder per Patch.
- `portfolio_patch_submission_reviews`: Patch-specific review state (`pending`, `reviewing`, `approved`, `revision_required`).
- `portfolio_patch_review_events`: append-only audit timeline of review status changes.
- Existing neutral Portfolio Versions remain separate from Patch submission selection.

## Snapshot rules

1. When a Patch reaches its scheduled start, `snapshot_due_patch_rosters()` records all active registered members with a current 4AM affiliation.
2. A member moved from 4PM into 4AM during an active Patch is added once with source `affiliation_transfer`.
3. A member who leaves 4AM after the opening snapshot remains in the roster.
4. Manual-only records are not added to the submission roster because they have no website account and cannot own/submit Portfolio folders. A linked Manual row uses its canonical registered `user_id`. If it links after an active Patch snapshot already exists, it is added once with source `manual_link`; if the Patch snapshot is still due, the post-link snapshot includes it normally.
5. A member already present is never duplicated due to repeated moves.

The final Production release will schedule the snapshot function using the existing `pg_cron` capability at a low frequency (once per minute). No recurring cron job is running in Free Staging, to avoid keeping an otherwise idle Free project awake. The affiliation-change RPC also snapshots any due Patch before mutating affiliation history, protecting the opening roster if a member moves around the scheduled start.

## Command Center workflow

- Submission is allowed only for a registered active member in the Patch roster, for their own Portfolio folder and a Version belonging to that folder.
- Submission creates a Patch-specific review row with `pending` status.
- A reviewer with Developer/Leader/Management permissions can set `reviewing`, `approved`, or `revision_required`.
- `revision_required` requires a non-empty review note.
- Selecting a different Version and resubmitting resets the Patch review state to `pending`; previous review events remain in the audit table.
- A non-roster member cannot submit.
- A non-reviewer cannot change review state.

## QA performed

- Opening snapshot included only current 4AM registered accounts.
- Member moved out of 4AM after Patch opening remained in the roster.
- Member moved from 4PM into 4AM during an active Patch was added once.
- Duplicate affiliation assignment remained idempotent.
- Submission for a non-roster member was rejected.
- Invalid Version selection was rejected.
- Management review to `revision_required` succeeded with a required note.
- Resubmission of a new Version reset status to `pending`.
- Review audit events were written for the transitions.
- Non-reviewer review attempt was rejected.
- All behavior-changing QA was wrapped in a transaction and rolled back. The permanent Staging fixtures remain synthetic.

## Current Staging fixture counts

| Table | Rows |
|---|---:|
| `portfolio_update_rounds` | 1 |
| `portfolio_patch_roster` | 2 |
| `portfolios` | 2 |
| `portfolio_patch_submissions` | 1 |
| `portfolio_patch_submission_reviews` | 1 |
| `portfolio_patch_review_events` | 1 |

## Important limitations

- Staging remains a focused feature schema, not a complete mirror of the existing Production application.
- The new UI is still an offline prototype; it does not yet replace the existing Portfolio Tracker.
- No production migrations, production member affiliations, production submissions, or Production deployment were performed in this work.
- Production already contains `portfolio_update_rounds` (0 rows), `portfolio_patch_submissions` (0 rows), 61 Portfolio folders, and 64 Portfolio Versions at the latest schema inventory. The existing Production `portfolio_patch_submissions` table has the same core columns, one-submission-per-folder unique constraint, and FK delete behavior now represented in Staging (member cascade, portfolio restrict, round cascade, version restrict). Before release, still compare all grants, RLS policies, indexes, and triggers on the live table; do not recreate or replace the existing table. Existing rows were only counted, not modified.


## Additional regression case pending

- Manual-only 4AM member links an account after a Patch opening snapshot; affiliation history is transferred to the canonical user and the account is added once to the active Patch roster as `manual_link`.
- This trigger change has been applied and tested transactionally on the active Free Staging project.


The Production migration now includes `manual_link` as a distinct roster source so the UI can distinguish account linking from an actual 4PM-to-4AM transfer. Review queue pagination also returns a total count for bounded Previous/Next navigation. These changes have been applied to Staging and passed the targeted roster/merge regression tests.


## Legacy Portfolio Tracker integration

- The existing member-facing Portfolio Tracker now reads only the selected Patch's bounded roster snapshot for its management progress totals.
- A member outside the 4AM snapshot sees a clear ineligible state instead of being counted as a missing submission; members can still view their own Portfolio folders.
- The submit RPC snapshots due rounds before checking roster eligibility, so a 4AM member can submit at the exact opening even if the minute worker has not run yet.
- Permanent Patch deletion was removed from the legacy tracker; archive/restore preserves the immutable roster and audit history.
- These integration changes are committed but await Staging revalidation.


## Egress controls in the legacy submission page

The member-facing Portfolio Tracker now fetches only the selected Patch's roster, the current member's affiliation, and the current member's folders (or the selected roster's folders for authorized management). It selects explicit fields, omits nested Portfolio image URLs entirely, and bounds round/roster/request/submission lists. It no longer downloads every member's Portfolio image metadata on every page load.


The Member Workspace Files tab now loads up to 100 image metadata rows only when the reviewer opens that tab, then resolves signed URLs through the existing Portfolio URL cache. Thumbnails use lazy loading; the default Overview and Directory views do not request Storage URLs or download image content. Opening a member's Portfolio from Workspace preserves Management mode.
