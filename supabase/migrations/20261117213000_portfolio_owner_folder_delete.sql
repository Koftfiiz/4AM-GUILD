-- Allow every active guild member to delete only their own Portfolio folder.
-- Keep reviewer permissions unchanged.
create policy "Portfolio owners can delete own portfolios"
on public.portfolios
for delete
to authenticated
using (
  member_id = (select auth.uid())
  and public.is_guild_member()
);

-- Deleting a folder removes only that folder's Versions, legacy images, and reviews.
-- PATCH submission foreign keys intentionally remain ON DELETE RESTRICT so audit history is preserved.
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
