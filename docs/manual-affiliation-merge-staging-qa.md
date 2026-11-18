# Manual-to-Account Affiliation Merge QA — 2026-11-19

When a Manual-only member later links to a registered website account, the Manual record is no longer the canonical identity. A Staging trigger now transfers its affiliation history to the registered `user_id`.

Rules verified:
- If the account has no current affiliation, the Manual affiliation history (including the current row) moves to the canonical `user_id`.
- If both identities already have current affiliations, the registered account's current affiliation takes precedence. The Manual current row is closed at link time, and its history is preserved under the canonical `user_id`.
- No affiliation row remains keyed to the linked `manual_member_id`, so the unified directory cannot double-count the same person.
- The merge runs in the same transaction as the account-link update.
- If linking fails, the transaction rolls back and the original Manual row remains unchanged.

Two synthetic scenarios were tested:
1. Manual 4PM member linked to an account with no affiliation: current 4PM history transferred to the account.
2. Manual 4PM member linked to an account already in 4AM: registered 4AM affiliation remained current; Manual 4PM history was closed and retained against the canonical account.

All test changes were rolled back. Production data and account-link records were not modified.
