-- Enable intentional permanent deletion of a selected Portfolio folder.
-- All dependent history is deleted only for that exact folder; unrelated folders are untouched.
drop policy if exists "Portfolio reviewers can delete portfolios" on public.portfolios;
drop policy if exists "Portfolio owners and reviewers can delete portfolios" on public.portfolios;
create policy "Portfolio owners and reviewers can delete portfolios"
on public.portfolios
for delete
to authenticated
using (
  (member_id = (select auth.uid()) and public.is_guild_member())
  or public.is_portfolio_reviewer()
);

-- A confirmed permanent deletion cascades only through the selected folder's records.
alter table public.portfolio_versions
  drop constraint if exists portfolio_versions_portfolio_id_fkey;
alter table public.portfolio_versions
  add constraint portfolio_versions_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete cascade;

alter table public.portfolio_images
  drop constraint if exists portfolio_images_portfolio_id_fkey;
alter table public.portfolio_images
  add constraint portfolio_images_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete cascade;

alter table public.portfolio_reviews
  drop constraint if exists portfolio_reviews_portfolio_id_fkey;
alter table public.portfolio_reviews
  add constraint portfolio_reviews_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete cascade;

alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_portfolio_id_fkey;
alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_portfolio_id_fkey
  foreign key (portfolio_id) references public.portfolios(id) on delete cascade;

alter table public.portfolio_patch_submissions
  drop constraint if exists portfolio_patch_submissions_version_id_fkey;
alter table public.portfolio_patch_submissions
  add constraint portfolio_patch_submissions_version_id_fkey
  foreign key (version_id) references public.portfolio_versions(id) on delete cascade;
