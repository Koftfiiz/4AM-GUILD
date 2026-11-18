-- Staging-only index tune-up. Apply after the Patch Command Center foundation.
create index if not exists portfolios_member_idx on public.portfolios(member_id,created_at desc);
create index if not exists portfolio_patch_submissions_portfolio_idx on public.portfolio_patch_submissions(portfolio_id);
create index if not exists portfolio_patch_submissions_version_idx on public.portfolio_patch_submissions(version_id);
create index if not exists portfolio_version_images_version_idx on public.portfolio_version_images(version_id,sort_order);
