# Guild Affiliation Staging QA — 2026-11-19

## Environment

- Supabase project: `4AM-GUILD-Staging` (`jmuxbomowtqcigesbimz`)
- Plan: Free, quoted project creation cost $0/month
- Region: Singapore
- Production data copied: none
- Storage objects copied: none
- Discord credentials/webhooks connected: none
- Schema scope: isolated Guild Affiliation prototype schema only; this is not a complete mirror of the existing Production application schema.

## Synthetic fixture counts

| Table | Rows |
|---|---:|
| guilds | 2 |
| guild_members | 6 |
| guild_manual_members | 4 |
| guild_member_affiliations | 5 |

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
- `anon` cannot execute either SECURITY DEFINER function. Authenticated execution is intentional: both functions enforce role checks, and the mutation RPC validates caller authorization internally.

## Advisor notes

- Supabase security advisor still reports the two SECURITY DEFINER functions as callable by authenticated users. This is intentional for the authenticated RLS helper and controlled RPC; the RPC enforces admin membership and the helper only returns the caller's own authorization status.
- Performance advisor reports the guild/current index as unused in the small synthetic test. Keep it for the intended directory query; do not remove an index solely because a tiny fixture did not exercise production-scale access patterns.

## Limitations / next work

- This schema is not yet the complete application Staging baseline. The Production database contains more legacy tables, policies, triggers, RPCs, and Edge Function dependencies than the migration files currently checked into the repository.
- Do not point the production app at this partial Staging schema.
- Continue by completing the schema inventory and reviewing existing member-directory/portfolio patch data contracts before implementing the integrated Member Directory and Patch Roster.
- No Production schema or data was modified during this staging work. The earlier Guild Affiliation foundation already exists in Production and has zero assigned affiliation rows.
