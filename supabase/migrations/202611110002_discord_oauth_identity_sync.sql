-- 4AM GUILD: Persist the signed-in member's Discord OAuth identity.
-- OAuth proves control of a Discord account only. It does NOT prove membership
-- in the 4AM Discord server or Sword of Justice guild, and grants no app access.

create or replace function public.sync_my_discord_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_app_meta jsonb := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);
  v_user_meta jsonb := coalesce(v_claims -> 'user_metadata', '{}'::jsonb);
  v_discord_id text;
  v_username text;
  v_global_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    coalesce(v_app_meta ->> 'provider', '') = 'discord'
    or coalesce(v_app_meta -> 'providers', '[]'::jsonb) ? 'discord'
  ) then
    raise exception 'A Discord OAuth identity is required';
  end if;

  v_discord_id := nullif(trim(coalesce(
    v_user_meta ->> 'provider_id',
    v_user_meta ->> 'sub',
    ''
  )), '');

  v_username := nullif(trim(coalesce(
    v_user_meta ->> 'user_name',
    v_user_meta ->> 'username',
    v_user_meta ->> 'preferred_username',
    ''
  )), '');

  v_global_name := nullif(trim(coalesce(
    v_user_meta ->> 'full_name',
    v_user_meta ->> 'global_name',
    v_user_meta ->> 'name',
    ''
  )), '');

  if v_discord_id is null then
    raise exception 'Discord User ID was not returned by OAuth';
  end if;

  insert into public.discord_accounts (
    user_id,
    discord_user_id,
    discord_username,
    discord_global_name,
    verified,
    verified_at,
    last_checked_at
  )
  values (
    auth.uid(),
    v_discord_id,
    v_username,
    v_global_name,
    true,
    now(),
    now()
  )
  on conflict (user_id) do update
  set discord_user_id = excluded.discord_user_id,
      discord_username = excluded.discord_username,
      discord_global_name = excluded.discord_global_name,
      verified = true,
      verified_at = coalesce(public.discord_accounts.verified_at, now()),
      last_checked_at = now();
end;
$$;

revoke all on function public.sync_my_discord_account() from public;
grant execute on function public.sync_my_discord_account() to authenticated;
