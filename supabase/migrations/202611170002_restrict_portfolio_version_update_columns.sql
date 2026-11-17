-- Keep Portfolio Version snapshots immutable through the Data API.
revoke update on table public.portfolio_versions from anon, authenticated;
revoke update (
  id, portfolio_id, version_number, round_id, patch_label, title, description,
  game_class, portfolio_type, created_by, created_at, version_name
) on table public.portfolio_versions from anon, authenticated;
revoke update (version_name) on table public.portfolio_versions from anon;
grant update (version_name) on table public.portfolio_versions to authenticated;
