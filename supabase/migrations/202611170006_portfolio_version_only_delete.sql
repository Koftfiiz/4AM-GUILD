-- Restore protection against deleting an entire Portfolio folder.
-- Only the owner may delete an individual Version; PATCH submission history is retained.

drop policy if exists "Portfolio owners and reviewers can delete portfolios" on public.portfolios;
drop policy if exists "Portfolio reviewers can delete portfolios" on public.portfolios;
create policy "Portfolio reviewers can delete portfolios"
on public.portfolios
for delete
to authenticated
using (public.is_portfolio_reviewer());

-- Keep folder-level records protected from cascade deletion.
alter table public.portfolio_versions
  drop constraint if exists portfolio_versions_portfolio_id_fkey;
alter table public.portfolio_versions
  add constraint portfolio_versions_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete restrict;

alter table public.portfolio_images
  drop constraint if exists portfolio_images_portfolio_id_fkey;
alter table public.portfolio_images
  add constraint portfolio_images_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete restrict;

alter table public.portfolio_reviews
  drop constraint if exists portfolio_reviews_portfolio_id_fkey;
alter table public.portfolio_reviews
  add constraint portfolio_reviews_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete restrict;

alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_portfolio_id_fkey;
alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete restrict;

-- A Version with a PATCH submission cannot be deleted, preserving audit history.
alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_version_id_fkey;
alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_version_id_fkey
  foreign key (version_id) references public.portfolio_versions(id) on delete restrict;

-- Child images and review rows for the selected Version may still cascade with that Version.
drop policy if exists "Portfolio owners can delete own versions" on public.portfolio_versions;
drop policy if exists "Owners can delete own portfolio versions" on public.portfolio_versions;
create policy "Owners can delete own portfolio versions"
on public.portfolio_versions
for delete
to authenticated
using (
  exists (
    select 1 from public.portfolios p
    where p.id = portfolio_versions.portfolio_id
      and p.member_id = (select auth.uid())
  )
  and public.is_guild_member()
);
