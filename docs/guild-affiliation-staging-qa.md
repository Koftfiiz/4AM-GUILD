# Guild Affiliation Staging QA — 2026-11-19

## Environment

- Supabase project: `4AM-GUILD-Staging` (`jmuxbomowtqcigesbimz`)
- Plan: Free, quoted project creation cost $0/month
- Region: Singapore
- Production data copied: none
- Storage objects copied: none
- Discord credentials/webhooks connected: none
- Schema scope: synthetic feature schema covering Guild Affiliation, Member Directory, Patch roster, Portfolio submissions, review workflow, and small Portfolio image fixtures; this is not a complete mirror of the Production application.

## Synthetic fixture counts

| Table | Rows |
|---|---:|
| guilds | 2 |
| guild_members | 7 |
| guild_manual_members | 4 |
| guild_member_affiliations | 9 |
| discord_accounts | 7 |
| portfolio_update_rounds | 5 |
| portfolio_patch_roster | 14 |
| portfolio_patch_submissions | 5 |
| portfolio_patch_submission_reviews | 5 |
| portfolio_patch_review_events | 7 |

The fixture set includes one manual row linked to a registered account and three manual-only rows. It uses invented character names and fixed synthetic UUIDs.

## Verified behaviors

- Two guild records (4AM and 4PM) are present.
- An affiliation move closes the prior row and inserts a new current row.
- Repeating assignment to the same guild is idempotent and does not create duplicate history.
- A member with an active management/developer role can perform an assignment through the RPC.
- A non-admin caller is rejected.
- Supplying both identity types is rejected.
- A linked manual row is rejected and must use its canonical registered `user_id`.
- A manual-only record can receive an affiliation.
- Transactional QA changes were rolled back; fixture state remains unchanged.
- `anon` cannot execute the feature SECURITY DEFINER RPCs. Authenticated execution is intentional for the role-check helper and controlled mutation RPCs; each mutation checks `auth.uid()` and the active Developer/Leader/Management permission helper. The internal snapshot and trigger functions are not directly executable by `anon` or `authenticated`.

## Advisor notes

- Supabase security advisor reports authenticated-callable SECURITY DEFINER functions. These are the intentionally exposed authorization helper and guarded RPCs; the internal snapshot/trigger functions are not exposed. The advisor also reports the Staging Auth leaked-password-protection setting; this is an inherited project Auth configuration, not a new schema exposure.
- Performance advisor no longer reports duplicate permissive RLS policies after policy consolidation. It reports nine unused indexes on the tiny synthetic dataset; keep the FK, roster snapshot, review queue, and history indexes for their production query paths rather than removing them based on a small fixture.

## Limitations / next work

- Staging remains a focused feature schema, not a full clone of the Production application or its Edge Functions/Discord integrations.
- Do not point the production app at this feature-only Staging schema.
- The new pages still need browser QA with real authenticated Staging users, responsive/accessibility checks, and legacy Portfolio Tracker regression testing.
- No Production schema or data was modified during this Staging QA. Production still has zero assigned affiliation rows and no Patch roster/review tables.


## Follow-up security hardening

The feature branch now tightens the management RPC helper to the same Developer/Leader/Management role set used by the existing application, requires an active membership status, and preserves the owner Developer allowlist. The corresponding SQL edits have been re-applied to Staging and verified by schema contract tests and targeted member-versus-Developer authorization checks.


## Latest Staging revalidation

- The canonical migrations `20261119000000`, `20261119000100`, and `20261119000200` were applied successfully to the Free Staging project.
- Guild Affiliation and Patch Command Center schema contract tests both pass.
- Directory and Command Center read RPCs return data for an authorized synthetic Developer.
- Function privileges were checked: no new privileged RPC is executable by `anon`; member-facing functions are executable by `authenticated`; the internal snapshot worker is not directly executable by either public role.
- A normal synthetic Member cannot change affiliations or open the management-only Command Center and cannot read another member's historical affiliation rows.


## Member Workspace follow-up

The feature branch now loads Discord identity/verification and affiliation history only when Management opens a Workspace. The Workspace History tab combines affiliation history with Patch review events. Requests are bounded (50 affiliation rows, 30 folders, 100 Versions, 50 review events) and do not run during normal directory/dashboard loads. Actual browser QA with a signed-in Staging user remains outstanding.


## Staging baseline follow-up

The Staging-only follow-up has been applied. It adds synthetic Discord Account fixtures, aligns affiliation indexes/policies with Production, permits the `manual_link` Patch roster source, and aligns Patch Submission FK delete actions. It contains no Production data or secrets.


## RPC-only write boundary

The final Guild Affiliation migration revokes direct `INSERT`, `UPDATE`, and `DELETE` privileges on `guilds` and `guild_member_affiliations` from client roles. Authenticated users retain `SELECT`; affiliation changes go only through `set_guild_member_affiliation`, which validates the active Developer/Leader/Management role and performs the write as the function owner. Staging privilege checks confirm authenticated cannot write directly, authenticated can execute the guarded RPC, and anon cannot execute it.


## Staging app permission parity

The Staging app grant/RLS follow-up now restores the authenticated write privileges required by the existing Management member editor and Manual directory, while keeping row-level policies as the authorization boundary. Discord Account writes remain Developer-only. Anonymous table privileges are revoked for the feature schema. The Guild Affiliation and Patch schema contract tests still pass after this alignment.
