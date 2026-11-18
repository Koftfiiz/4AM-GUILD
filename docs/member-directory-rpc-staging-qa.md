# Member Directory RPC QA — 2026-11-19

## Implementation

Added the Staging-only `get_guild_member_directory` RPC.

- Uses `SECURITY INVOKER`; it does not bypass table RLS.
- Requires an active guild member.
- Combines registered members with active, unlinked Manual-only records.
- Excludes linked Manual duplicates; their canonical identity is the registered `user_id`.
- Includes current 4AM/4PM affiliation and affiliation start time.
- Supports server-side search by character name, nickname, and Discord name.
- Supports guild, Class, and record-type filters.
- Returns a bounded page (1–100 rows) plus result total and summary counts.
- Search length is capped at 80 characters and offset at 5,000.
- Current affiliation rows are readable to active guild members for directory display; historical affiliation rows remain limited to the member and management/admin access.

## QA

- Authenticated active member successfully queried the directory.
- Page size 2 returned 2 records; offset 2 returned the next 2 records.
- 4AM filter returned 3 synthetic records: 2 registered accounts and 1 manual-only record.
- Summary counts included 4AM, 4PM, unassigned, registered, and manual totals.
- The linked Manual row did not appear as a duplicate.
- A caller without active guild membership was rejected with `Active guild membership required`.
- No production directory query or data change was performed.

## Egress design

The new directory endpoint does not download all members to the browser. It returns only the requested page and compact counts. The existing legacy member page remains untouched until the new directory UI is integrated and regression-tested.
