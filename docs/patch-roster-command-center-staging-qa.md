# Patch Roster & Command Center Staging QA — 2026-11-19

## Staging scope

All tables and records below exist only in `4AM-GUILD-Staging`. They are synthetic fixtures; no Production member rows, Portfolio rows, Storage objects, Auth users, Discord credentials, or webhooks were copied.

## Implemented Staging data model

- `portfolio_update_rounds.roster_snapshot_at`: marks that the opening snapshot has been created.
- `portfolio_patch_roster`: immutable member snapshot per Patch, including display-name/Class snapshots and source (`opening_snapshot` or `affiliation_transfer`).
- `portfolio_patch_submissions`: one selected Version per Portfolio folder per Patch.
- `portfolio_patch_submission_reviews`: Patch-specific review state (`pending`, `reviewing`, `approved`, `revision_required`).
- `portfolio_patch_review_events`: append-only audit timeline of review status changes.
- Existing neutral Portfolio Versions remain separate from Patch submission selection.

## Snapshot rules

1. When a Patch reaches its scheduled start, `snapshot_due_patch_rosters()` records all active registered members with a current 4AM affiliation.
2. A member moved from 4PM into 4AM during an active Patch is added once with source `affiliation_transfer`.
3. A member who leaves 4AM after the opening snapshot remains in the roster.
4. Manual-only records are not added to the submission roster because they have no website account and cannot own/submit Portfolio folders. A linked Manual row uses its canonical registered `user_id`.
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
- Production already contains `portfolio_update_rounds` (0 rows), `portfolio_patch_submissions` (0 rows), 61 Portfolio folders, and 64 Portfolio Versions at the latest schema inventory. The existing Production `portfolio_patch_submissions` table has a legacy schema and must be reconciled with the Staging prototype before any Production migration is written. Existing rows were only counted, not modified.
