-- Enforce strict owner-only Portfolio folder deletion for every role.
-- A reviewer may review another member's Portfolio, but cannot delete it.
drop policy if exists "Portfolio reviewers can delete portfolios" on public.portfolios;
