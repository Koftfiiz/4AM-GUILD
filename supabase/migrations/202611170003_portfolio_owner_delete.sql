-- Allow active portfolio owners to permanently delete their own folders.
-- Keep reviewer deletion available and avoid duplicate permissive DELETE policies.
drop policy if exists "Portfolio reviewers can delete portfolios" on public.portfolios;
drop policy if exists "Portfolio owners and reviewers can delete portfolios" on public.portfolios;

create policy "Portfolio owners and reviewers can delete portfolios"
on public.portfolios
for delete
to authenticated
using (
  (
    member_id = (select auth.uid())
    and public.is_guild_member()
  )
  or public.is_portfolio_reviewer()
);

-- A permanent folder deletion also removes its Patch submission rows.
-- This matches the UI confirmation, which states that all folder/version data is deleted.
alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_version_id_fkey;

alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_version_id_fkey
  foreign key (version_id)
  references public.portfolio_versions(id)
  on delete cascade;
